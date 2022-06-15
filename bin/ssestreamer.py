#!/usr/bin/python
  
##################################################
#    This file is part of the HABTracker project for tracking high altitude balloons.
#
#    Copyright (C) 2022, Jeff Deaton (N6BA)
#
#    HABTracker is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    HABTracker is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with HABTracker.  If not, see <https://www.gnu.org/licenses/>.
#
##################################################

import os
import math
import time
import datetime
import psycopg2 as pg
import sys
from multiprocessing import Queue
from Queue import Empty, Full
#from flask import Flask, Response
import flask
import json

#import local configuration items
import habconfig


streamer_queue = None
app = flask.Flask(__name__)

import logging
logging.basicConfig(level=logging.INFO)

@app.route("/", methods=["GET"])
def listen():
    def eventStream():
        global streamer_queue

        i = 1
        while True:
            if streamer_queue:
                try:
                    d = streamer_queue.get(.1)
                    d_str = json.dumps(d)
                    msg = "event: device\nid: {}\ndata: {}\n\n".format(i, d_str)
                    yield msg
                    i += 1
                except Empty:
                    #yield "data: {}\n\n".format("no data available")
                    pass
            #else:
            #    yield "data: {}\n\n".format("stream queue not valid")

    return flask.Response(eventStream(), mimetype="text/event-stream")



##################################################
# runSSEStreamer
#    - Then starts up the SSE streaming server
##################################################
def runSSEStreamer(q = None, port=8765, e = None):
    try:
        print "SSE Streamer started on port: ", port
        sys.stdout.flush()

        global streamer_queue
        streamer_queue = q
        #print "initial pull from queue:  ", streamer_queue.get(1)
        #if q:
        #    while not e.is_set():
        #        try:
        #            d = q.get_nowait()
        #            print "data: ", d
        #            sys.stdout.flush()
        #        except (Empty, Full) as error:
        #            pass
        #        e.wait(.05)

        app.run(port=8765, debug=False, use_reloader=False)
        #while not e.is_set():
        #    for a in eventStream():
        #        print "data: ", a

    except (KeyboardInterrupt, SystemExit):
        print "SSE Streamer stopped."



