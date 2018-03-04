# homebridge-ir-raw-sender

Homebridge plugin to send ir raw signals from remotes using pigpio.

It is focused to send commands for Brazilian air conditioners which is mostly
the cool/auto (fan)/off modes. There is no need for a heat mode.
It is completely set to work with Celsius only.
The idea is to have a server that should replace your air remote controller,
which means all the information is stored locally on homebridge and that is the
truth for the world outside. Nothing is considered on the remote anymore
(I threw it out.)


# Installation

Not available yet.

homebridge-ir-raw-sender uses pigpio-client lib which require to run as root.

It also uses node-persist to make the values persist between sessions.

# WIP

It is a work in progress project and needs to be changed to work properly with
configs from the config file.

It is also a straight translation of a lot of python codes I used to test the pigpio
library that did the job perfectly.

I am not a JS programmer, so the code is a complete mess.

Feel free to contribute, improve and make it as it should be.

Really thanks to the explanations from Brian Schwind on his post about
[Sending Infrared Commands From a Raspberry Pi Without LIRC](http://blog.bschwind.com/2016/05/29/sending-infrared-commands-from-a-raspberry-pi-without-lirc/)



# Configuration

Configuration example:
```
{

	"accessories": [
		{
			"accessory": "IRSender",
			"name": "Air Cond",
			"pin": 22
		},
	],

	"platforms":[]
}
```
