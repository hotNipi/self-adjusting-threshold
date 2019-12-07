module.exports = function(RED) {
    "use-strict";

    function SelfAdjustingThreshold(config) {
        RED.nodes.createNode(this, config);
        var node = this;

        node.max = config.max || 80;
        node.period = config.period || 12;
        node.minperiod = node.period > 1 ? 2 : 0;
        node.head = config.head || 15;
        node.interval = config.interval * 60000 || 0;
        node.payloadtype = config.payloadtype || "literal";
        node.invert = config.invert || false;


        node.storage = node.context();

        node.lasthour = node.storage.get("lasthour") || -1;
        node.lastmove = node.storage.get("lastmove") || "";
        node.lastmovetime = node.storage.get("lastmovetime") || 0;

        node.payloadmap = { "literal": ["ON", "OFF"], "boolean": [true, false], "numeric": [1, 0] };

        const average = arr => arr.reduce((p, c) => p + c, 0) / arr.length;




        function clear() {
            node.storage.set("zones", {});
            node.lasthour = -1;
            node.storage.set("lasthour", node.lasthour);
            node.lastmove = "";
            node.storage.set("lastmove", node.lastmove);
        }

        function registerInput(v, t, m) {
            if (v > node.max) {
                v = node.max;
            }
            var target;
            var zones = node.storage.get("zones") || {};
            if (zones.hasOwnProperty(t)) {
                target = zones[t];
                if (target.minute === m) {
                    target.collection.pop();
                }
                target.minute = m;
                target.collection.push(v);
                if (target.collection.length > 60) {
                    target.collection.shift();
                }
                zones[t] = target;
                node.storage.set("zones", zones);
            } else {
                var sp = setPointFromValue(v);
                target = { name: t, minute: m, collection: [v], history: [sp], setpoint: sp, sent: false, lock:true };
                zones[t] = target;
                node.storage.set("zones", zones);
            }
        }

        function setPointFromValue(v) {
            var p = v + (v * (node.head / 100));
            return Math.ceil(p);
        }

        function updateStorage() {
            var zones = node.storage.get("zones") || {};
            var target;
            var min;
            for (var t in zones) {
                target = zones[t];
                min = Math.min(...target.collection);
                target.history.push(min);
                if(target.lock === true && target.history.length === node.minperiod){
                    target.lock = false;
                }
                while (target.history.length > node.period) {
                    target.history.shift();
                }
            }
            node.storage.set("zones", zones);
        }

        function calculateSetpoints() {
            var zones = node.storage.get("zones") || {};
            var target;
            var p;
            for (var t in zones) {
                target = zones[t];
                p = setPointFromValue(average(target.history));
                if (p !== target.setpoint) {
                    target.setpoint = p;
                    target.sent = false;
                }
            }
            node.storage.set("zones", zones);
        }

        function getSetpointMessage(t) {
            var zones = node.storage.get("zones") || {};
            var target = zones[t];
            if (target.sent === false) {
                target.sent = true;
                node.storage.set("zones", zones);
                return { payload: target.setpoint, topic: t };
            }
            return null;
        }


        function checkThreshold(v, t) {
            var zones = node.storage.get("zones") || {};
            var target;

            if (node.lastmove === "") {
                target = zones[t];
                if(target.lock === true){
                    return false;
                }
                if (v > target.setpoint) {
                    node.lastmove = "over";
                    node.storage.set("lastmove", node.lastmove);
                    return true;
                } else if (v < target.setpoint) {
                    node.lastmove = "under";
                    node.storage.set("lastmove", node.lastmove);
                    return true;
                } else {
                    return false;
                }
            } else {
                var count = 0;
                for (var z in zones) {
                    target = zones[z];
                    if(target.lock === true){
                        count ++;
                        continue;
                    }
                    if (node.lastmove === "under") {
                        if (target.collection[target.collection.length - 1] > target.setpoint) {
                            node.lastmove = "over";
                            node.storage.set("lastmove", node.lastmove);
                            return true;
                        }
                    } else {
                        if (target.collection[target.collection.length - 1] > target.setpoint) {
                            count++;
                        }
                    }
                }
                if (count > 0) {
                    return false
                }
                if (node.lastmove === "over") {
                    node.lastmove = "under";
                    node.storage.set("lastmove", node.lastmove);
                    return true
                }
                return false;
            }
        }

        function isValidInput(v) {
            if (isNaN(v)) {
                return false;
            }
            if (v > 100) {
                return false;
            }
            if (v < 0) {
                return false;
            }
            return true;
        }

        function checkInterval(ms) {
            if (node.lastmovetime === 0) {
                return true;
            }
            if (node.lastmovetime + node.interval < ms) {
                return true;
            }
            return false;
        }

        function updateInterval(ms) {
            node.lastmovetime = ms;
            node.storage.set("lastmovetime", node.lastmovetime);
        }

        function getPayloadByType(move) {
            var pos;
            if (node.invert === true) {
                pos = move === "over" ? 1 : 0;
            } else {
                pos = move === "over" ? 0 : 1;
            }
            return node.payloadmap[node.payloadtype][pos];
        }

        function getStatusMessage(){
            var zones = node.storage.get("zones") || {};
            if(node.lastmove != ""){
                var target;
                var ob = {lastcommand:getPayloadByType(node.lastmove)};
                ob.lastcommandtime = node.lastcommandtime;
                ob.zones = {};
                for (var z in zones) {
                    target = zones[z];                   
                    ob.zones[target.name] = {setpoint:target.setpoint,
                        lastinput:target.collection[target.collection.length-1],
                        collectedperiod:target.history.length
                    };
                    
                }
                return {payload:ob,topic:"status"};
            }
            

            return null;
        }

        function updateStatus() {
            if (node.lastmove === "") {
                node.status({});
            } else {
                var sh = node.lastmove === "under" ? "ring" : "dot";
                node.status({ fill: "blue", shape: sh, text: node.lastmove });
            }
        }




        updateStatus();

        this.on('input', function(msg,send,done) {
            send = send || function() { node.send.apply(node,arguments) }
            if (msg.hasOwnProperty('payload')) {
                if (msg.payload === "clear") {
                    clear();
                    if(done){
                        done()
                    }
                    return;
                }
                if(msg.payload === 'status'){
                    var m = getStatusMessage();
                    if(m !== null){
                        send([m, null]);
                    }
                    if(done){
                        done()
                    }
                    return;
                }
                var topic;
                if (!msg.hasOwnProperty("topic") || msg.topic === "") {
                    topic = "nameless-zone";
                } else {
                    topic = msg.topic;
                }

                var value = Number(msg.payload);

                if (isValidInput(value) === true) {
                    var setpointMessage = null;
                    var thresholdMessage = null;
                    var d = new Date();

                    registerInput(value, topic, d.getMinutes())

                    if (d.getHours() !== node.lasthour) {
                        if(node.lasthour !== -1){
                            updateStorage();
                        }                        
                        node.lasthour = d.getHours();
                        node.storage.set("lasthour", node.lasthour);
                        calculateSetpoints();
                    }

                    setpointMessage = getSetpointMessage(topic);

                    if (checkInterval(d.getTime()) === true) {
                        if (checkThreshold(value, topic) === true) {
                            thresholdMessage = { payload: getPayloadByType(node.lastmove), topic: topic };
                            updateInterval(d.getTime());
                        }
                    }

                    if (setpointMessage === null && thresholdMessage === null) {
                        if(done){
                            done()
                        }
                        return;
                    }
                    updateStatus();
                    send([setpointMessage, thresholdMessage]);
                    if(done){
                        done()
                    }
                }
                else{
                    if (done) {                       
                       done({"ERROR":"Input type error"})
                    }else {
                       node.error('Input error.', msg);
                   }
                }
            }

        });
    }
    RED.nodes.registerType("self-adjusting-threshold", SelfAdjustingThreshold);
}