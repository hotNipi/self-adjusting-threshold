# self-adjusting-threshold
[Node-RED](https://nodered.org/) contrib node

Self adjusting threshold controller for single exhaust ventilator to react in rapid change of humidity in wet rooms. Multiple zones supported.
Self adjusting calculation bases on relatively long term storage of input values. Storage history length is adjustable. As overall environment conditions change seasonally and change of outside weather affects indoor conditions, the humidity threshold of wet room(s) can follow such changes.

This node is targeted to control humidity change. This is **slowly changing proccess**. Do not expect correct behavior if system has been running less than 12 hours (if default settings applied)

And as target is humidity the node works only if input values are numbers in between 0 ... 100  

Expected input is humidity level of one or more zones with rate about once in minute. 
If used for multiple zones, the msg.topic per zone is required. 

