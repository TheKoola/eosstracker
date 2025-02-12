<?php

/***************
 * Base class for those SSE events that we regularly send to the browser
 ***************/
class BaseSSEEvent {

    // properties
    protected string $documentroot;   // the file path location of the www root dir.
    protected string $id;         // the id of this event (the string used to identify this SSE event).  
    protected float $lastupdate;    // timestamp of when we last sent this to the browswer...usually the output of: microtime(true).
    protected int $seq;           // sequence number.  Increments upon every call of generateSSEText().
    protected int $threshold;     // the number of seconds that we should wait before constructing new data that shoudl be sent to the browser.

    /*********************
     * constructor
     *********************/
    function __construct(string $id, int $threshold = 15) {

        $this->id = $id;
        $this->lastupdate = 0;
        $this->seq = 0;
        $this->threshold = $threshold;

        // get the documentroot 
        if (array_key_exists("CONTEXT_DOCUMENT_ROOT", $_SERVER))
            $this->documentroot = $_SERVER["CONTEXT_DOCUMENT_ROOT"];
        else
            $this->documentroot = $_SERVER["DOCUMENT_ROOT"];
    }

    // default function.  To be overloaded by sub classes.
    function generateSSEText(): ?string {
        $jsondata = new stdClass();
        $jsondata->what = "no data";

        $this->lastupdate = microtime(true);
        $jsondata->lastupdate = $this->lastupdate;
        $jsondata->seq = $this->seq;
        $this->seq++;

        return $this->_formSSE(json_encode($jsondata));
    }

    // helper function to construct the text for an SSE event.  
    protected function _formSSE(string $jsonstring): ?string {

        $string = null;

        // construct the string
        if ($this->id && $this->seq >= 0 && $jsonstring) {
            $string = "event: " . $this->id . "\n" . "id: " . $this->seq . "\n" . "data: " . $jsonstring . "\n\n";
        }

        return $string;
    }

    // set the threshold value
    function setThreshold(int $threshold): int {
        if ($threshold > 0) 
            $this->threshold = $threshold;

        return $this->threshold;
    }

    // set this SSE event's ID
    function setID(string $id): ?string {
        if ($id)
            $this->id = $id;

        return $this->id;
    }

    // reset sequence number
    function resetSeq(int $seq = 0): int {
        if ($seq >= 0)
            $this->seq = $seq;

        return $this->seq;
    }

}




/*********************
 * GPSEvent class that handles getting GPS status from default, file, or memcache.  
 *
 * Usage:
 * $mygps = new GPSEvent();
 * $ssetext = $mygps->generateSSEEvent();
 * if ($ssetext)
 *     sendSSEText($ssetext);
 *
 *********************/
class GPSEvent extends BaseSSEEvent {

    // properties
    public string $gpsjsonfile;     // name of the file where the habtracker backend saves the GPS status json 
    public string $timezone;        // the timezone of the backend system.  ex. 'America/Detroit'
    private string $fallback_timezone;  // use this timezone when all else fails.

    // constructor
    function __construct(int $threshold = 15) {
        parent::__construct("gpsstatus", $threshold); 

        // set property defaults
        $this->gpsjsonfile = "gpsstatus.json";
        $this->timezone = "America/Denver";
        $this->fallback_timezone = "America/Denver";
    }

    // called to generate the text for an SSE event.  
    // returns a string if successful or null otherwise.
    function generateSSEText(): ?string {

        // where we store our SSE event string (that could be sent to the browser).
        $ssestring = null;

        // get the current status of the GPS
        $gps = $this->getGPSStatus();

        // the current time.  Which we'll use to compare to the timestamp (in the GPS json) to determine if the results are stale or not.
        $currenttime = microtime(true);

        // by default, we're not going to send this to the browser
        $cleartosend = false;

        // the timestamp on the GPS geojson object.
        $gpstimestamp = 0;

        // if there was a gps object returned...
        if ($gps) {

            // extract the EPOCH seconds from the returned geojson
            $gpstimestamp = $this->getMicroSecs($gps);

            // boolean to determine if data from the GPS is stale
            $staledata = (($currenttime - $gpstimestamp) > $this->threshold * 2 ? true : false);

            // check if this was just a default geojson structure or is stale data.  If that's the case, 
            // then we don't want to repeatedly pepper the browser with lots of blank geojson
            // objects.  So we trottle.
            if ($gps->properties->gpssource == "Default GPS Status" || $staledata) {

                // determine if enough time has elapsed that we should re-send the default GPS json 
                // ...OR...
                // if the original GPS data is just stale and we should re-send it as enough time has elapsed.
                // ...OR...
                // the last time we sent an update (i.e. $this->seq) is 0.  If that's the case then we've never sent an update.
                // ...OR...
                // the prior GPS status we obtained was live.  That means the GPS is transitioning from live data to stale/default data.
                if ((floor($currenttime - $this->lastupdate) % ($this->threshold * 2) == 0 && $currenttime - $this->lastupdate > $this->threshold) || $this->seq == 0) {
                    $cleartosend = true;
                }
            }
            else {

                // this was a real GPS status so we always want to send that to the browser, 
                // but only if there's new data from the GPS (look at the timestamps)
                if ($gpstimestamp > $this->lastupdate) 
                    $cleartosend = true;
            }
        } 

        // if GPS data wasn't stale, and we're clear to generate an SSE event
        if ($cleartosend && $gps) {

            // create the SSE string
            $ssestring = $this->_formSSE(json_encode($gps));

            // update the last GPS timestamp time
            $this->lastupdate = $currenttime;

            // increment the sequence number
            $this->seq++;
        }

        return $ssestring;
    }

    /************
     * createDefaultStatus
     *
     * This will create a default GPS status object in geojson format
     ***********/
    private function createDefaultGPSStatus(): ?object {

        // default gps status
        $gpsstatus = new stdClass();
        $gpsstatus->status = "no device";
        $gpsstatus->host = "n/a";
        $gpsstatus->devicepath = "";
        $gpsstatus->speed_mph = 0.0;
        $gpsstatus->mode = 0;
        $gpsstatus->lat = 0.0;
        $gpsstatus->lon = 0.0;
        $gpsstatus->altitude = 0.0;
        $gpsstatus->utc_time = "";
        $gpsstatus->satellites = array();

        $dt = null;

        // try and create a new timestamp object using the timezone supplied when this object was instanciated.
        try {
            $dt = new DateTime("now", new DateTimeZone($this->timezone));
        } catch (Exception $e) {

            // if there was a problem with the user specified time zone (shouldn't be), then just default to the hardcoded fallback timezone.
            $dt = new DateTime("now", new DateTimeZone($this->fallback_timezone));
        }
        $timestring = $dt->format('Y-m-d\TH:i:s\Z');

        // create the default geojson object
        $geojson = new stdClass();
        $geojson->type = "FeatureCollection";
        $geojson->properties = new stdClass();
        $geojson->properties->name = "My station";
        $geojson->properties->gpssource = "Default GPS Status";
        $geojson->properties->microsecs = microtime(true);
        $geojson->features[] = new stdClass();
        $geojson->features[0]->type = "Feature";
        $geojson->features[0]->properties = new stdClass();
        $geojson->features[0]->properties->speed_mph = 0.0;
        $geojson->features[0]->properties->altitude = 0.0;
        $geojson->features[0]->properties->bearing = 0.0;
        $geojson->features[0]->properties->time = $timestring;
        $geojson->features[0]->properties->gps = $gpsstatus;
        $geojson->features[0]->properties->callsign = "My Location";
        $geojson->features[0]->properties->tooltip = "";
        $geojson->features[0]->properties->id = "My Location";
        $geojson->features[0]->properties->symbol = "1x";
        $geojson->features[0]->properties->comment = "default stuff";
        $geojson->features[0]->properties->frequency = "";
        $geojson->features[0]->properties->iconsize = "24";
        $geojson->features[0]->geometry = new stdClass();
        $geojson->features[0]->geometry->type = "Point";
        $geojson->features[0]->geometry->coordinates = array(0.0, 0.0);

        return $geojson;
    }

    /*********************
     * Wrapper function to get the GPS status from memcache or the gpsstatus.json file
     *********************/
    private function getGPSStatus(): ?object {

        // Check memcache for an updated GPS geojson object
        $js = $this->getGPSStatusMemcache();

        // if nothing from memcache, then check the GPS status file
        if (!$js)
            $js = $this->getGPSFileStatus();

        // if nothing from memcache or the GPS status file, then we return a blank, default GPS status object
        if (!$js)
            $js = $this->createDefaultGPSStatus();

        return $js;
    }

    /*********************
     * Function to get the GPS status from the gpsstatus.json file
     * Unlike a position update from the database, this contains satellite, device path, and other status elements.
     *********************/
    private function getGPSFileStatus(): ?object {

        $microsecs = 0;

        // read the gpsstatus.json file
        if(($cmdoutput = @file_get_contents($this->documentroot . "/" . $this->gpsjsonfile)) === false) {
            return null;
        }

        if ($cmdoutput == null) {
            return null;
        }

        // convert the returned JSON to a PHP object
        $js = json_decode($cmdoutput, false);
        $js = $this->setSourceText($js, "gpsstatus file");

        return $js;
    }

    /*********************
     * Function to get the GPS status from memcache...if it exists
     *********************/
    private function getGPSStatusMemcache(): ?object {

        // store results here
        $js = null;

        try {
            // create a new memcache object and connect to the backend daemon
            $memcache = new Memcache;
            $connectionresult = $memcache->connect('localhost', 11211);

            // Something happened getting connected to the memcache daemon
            if (!$connectionresult) {
                return null;
            }

            // attempt to get the process_status key from memcache
            $getresult = $memcache->get($this->id);

            // close the memcache connection
            $memcache->close();

            if ($getresult) {

                // convert the returned JSON to a PHP object
                $js = json_decode($getresult, false);
                $js = $this->setSourceText($js, "memcache");
            }

        } catch (Exception $e) {

            // close the memcache connection, just in case
            $memcache->close();

            // some issue reading from memcache
            return null;
        }

        return $js;
    }

    /*********************
     * Check for the existance of a "microsecs" property within geojson and return its value
     *********************/
    private function getMicroSecs($js): float {

        if (!$js)
            return null;

        // check if there was a microsecs value within the GeoJson data provided
        $microsecs = 0.000;
        if (property_exists($js, "properties")) {
            $properties = $js->properties;
            if (property_exists($properties, "microsecs")) {
                $microsecs = $properties->microsecs;
                if ($microsecs < 0)
                    $microsecs = 0;
            }
        }

        return $microsecs;
    }

    /*********************
     * Set the Properties->gpssource value for the GPS geojson structure
     *********************/
    private function setSourceText($geojsonObj, $text): ?object {

        // check if the properties key exists
        if (property_exists($geojsonObj, "properties")) {

            // set (or create) the gpssource key and set its value to the text provided.
            $geojsonObj->properties->gpssource = $text;
        }
        else {

            // the properties key didn't exist, so we need to create it.
            $geojsonObj->properties = new stdClass();
            $geojsonObj->properties->gpssource = $text;
        }

        return $geojsonObj;
    }
}



/*********************
 * ConfigEvent class that handles reading the configuration from the backend
 *
 * Usage:
 * $mycfg = new ConfigEvent();
 * $ssetext = $mycfg->generateSSEEvent();
 * if ($ssetext)
 *     sendSSEText($ssetext);
 *
 *********************/
class ConfigEvent extends BaseSSEEvent {

    // properties
    private string $configfile;      // the full path and file name of the configuration file
    private string $defaultsfile;    // the full path and file name of the defaults configuration file
    public string $timezone;         // the timezone of the backend system.  ex. 'America/Detroit'
    private string $fallback_timezone;  // use this timezone when all else fails.

    // constructor
    function __construct(int $threshold = 15) {
        parent::__construct("configuration", $threshold); 

        // set property defaults
        $this->configfile = $this->documentroot . "/configuration/config.txt";
        $this->defaultsfile = $this->documentroot . "/configuration/defaults.txt";
        $this->timezone = "America/Denver";
        $this->fallback_timezone = "America/Denver";
    }


    /************
     * getConfigurationFile
     *
     * read in the configuration file for this backend system 
     ***********/
    private function getConfigFile(): ?object {

        // fallback JSON object
        $ray = array();
        $ray["timezone"] = "America/Denver";
        $ray["callsign"] = "";
        $ray["lookbackperiod"] = "180";
        $ray["iconsize"] = "24";
        $ray["plottracks"] = "off";
        $ray["ssid"] = "9";
        $ray["igating"] =  "false";
        $ray["beaconing"] = "false";
        $ray["objectbeaconing"] = "false";
        $ray["passcode"] = "";
        $ray["fastspeed"] = "45";
        $ray["fastrate"] = "01:00";
        $ray["slowspeed"] = "5";
        $ray["slowrate"] = "10:00";
        $ray["beaconlimit"] = "02:00";
        $ray["fastturn"] = "20";
        $ray["slowturn"] = "60";
        $ray["audiodev"] = "0";
        $ray["serialport"] = "none";
        $ray["serialproto"] = "RTS";
        $ray["comment"] = "EOSS Tracker";
        $ray["includeeoss"] = "true";
        $ray["eoss_string"] = "EOSS";
        $ray["symbol"] = "/k";
        $ray["overlay"] = "";
        $ray["ibeaconrate"] = "15:00";
        $ray["ibeacon"] = "false";
        $ray["airdensity"] = "false";
        $ray["mobilestation"] = "true";
        $ray["gpshost"] = "";
        $ray["ka9qradio"] = "false";
        $fallbackJSON = json_encode($ray);

        // Defaults
        $defaultsJSON = file_get_contents($this->configfile);
        if ($defaultsJSON === false)
            $defaults = json_decode($fallbackJSON, true);
        else 
            $defaults = json_decode($defaultsJSON, true);


        // Get the configuration data from config.txt
        $configJSON = file_get_contents($this->defaultsfile);
        if ($configJSON === false)
            $configuration = $defaults;
        else 
            $configuration = json_decode($configJSON, true);

        foreach(array_keys($defaults) as $key) {
            if(!array_key_exists($key, $configuration))
                $configuration[$key] = $defaults[$key];
        }

        // Workaround to make sure this is never on until the plottracks feature is fully disposed of.  ;)
        $configuration["plottracks"] = "off";

        return (object) $configuration;
    }


    /************
     * getMemcacheConfigFile
     *
     * read in the configuration file for this backend system from memecache
     ***********/
    private function getMemcacheConfigFile(): ?object {

        // where we store the result
        $js = null;

        try {

            // create a new memcache object and connect to the backend daemon
            $memcache = new Memcache;
            $connectionresult = $memcache->connect('localhost', 11211);
            if (!$connectionresult)
                throw new Exception("memcache fail");

            // attempt to get the process_status key from memcache
            $getresult = $memcache->get('configuration');

            if ($getresult) {

                // convert the returned JSON to a PHP object
                $js = json_decode($getresult, false);
            }

            // close the memcache connection.
            $memcache->close();

        } catch (Exception $e) {

            // close the memcache object, just in case
            $memcache->close();
        }

        return $js;
    }


    /************
     * getConfig 
     *
     * this is a wrapper function that will read the configuration either from memcache or the unerlying file system
     ***********/
    private function getConfig(): ?object {

        // where we'll store the results
        $js = null;

        // try and fetch the configuration from memache
        $js = $this->getMemcacheConfigFile();

        // set the cache status if read from memcache was successful.
        if ($js)
            $js->memcache_status = "cache hit";

        // if memcache was unsuccessful, read from disk
        if (!$js) {
            $js = $this->getConfigFile();
            $js->memcache_status = "cache miss";
        }
    
        return $js;

    }

    /************
     * generateSSEText
     *
     * construct the SSE text (json) for this event.  Return null if there isn't anything we need to send to the browser.
     ***********/
    function generateSSEText(): ?string {

        // where we store our SSE event string (that could be sent to the browser).
        $ssestring = null;

        // get the current configuration
        $config = $this->getConfig();

        // current time 
        $currenttime = microtime(true);

        // if there was a config object returned...
        if ($config) {

            // extract the EPOCH seconds from the returned configuration object, 0 if not present.
            $timestamp = (property_exists($config, "timestamp") ? $config->timestamp : 0);

            // send this to the browser if new data is present
            // ...OR... 
            // it's the very first time (i.e. seq == 0)
            // ...OR...
            // it's been a really long time since we sent anything, so we should send an SSE message to the browser every so often (50 * $threshold seconds).
            if ($timestamp > $this->lastupdate || (floor($currenttime - $this->lastupdate) % ($this->threshold * 50) == 0 && $currenttime - $this->lastupdate > $this->threshold) || $this->seq == 0) {

                // the SSE string
                $ssestring = $this->_formSSE(json_encode($config));

                $this->lastupdate = $currenttime;
                $this->seq++;
            }
        }

        return $ssestring;
    }
}


/*********************
 * StatusEvent class that checks on which processes are running on the backend
 *
 * Usage:
 * $mystatus = new StatusEvent();
 * $ssetext = $mystatus->generateSSEEvent();
 * if ($ssetext)
 *     sendSSEText($ssetext);
 *
 *********************/
class StatusEvent extends BaseSSEEvent {

    // properties
    private string $jsonstatusfile;  // the full path and file name to the JSON status file that the habtracker-daemon.py process saves
    private array $processlist;      // an array that contains process names we want to check on
    private string $command;         // the operating system command to run that will return the status of the processes we're interested in.

    // constructor
    function __construct(int $threshold = 15) {
        parent::__construct("backendstatus", $threshold);

        // set property defaults
        $this->jsonstatusfile = $this->documentroot . "/daemonstatus.json";

        // list of processes we're interested in getting status for
        $this->processlist = Array("direwolf", "gpsd", "habtracker-d", "aprsc");

        // the OS command that will list the processes that we're interested in (assuming they're running)
        $this->command = "pgrep -l \"" . implode("|", $this->processlist) . "\"";
    }

    /************
     * generateSSEText
     *
     * construct the SSE text (json) for this event.  Return null if there isn't anything we need to send to the browser.
     ***********/
    function generateSSEText(): ?string {

        // where we store our SSE event string (that could be sent to the browser).
        $ssestring = null;

        // current time
        $currenttime = microtime(true);

        // only send an update if we've not already done so within the last 1 second or it's the first time we've been called.
        if ((int)$currenttime > (int)$this->lastupdate || $this->seq == 0) {

            // get the current process and backend daemon status
            $procstatus = $this->getProcessStatus();
            $daemonstatus = $this->getHabtrackerStatus();

            // form up the output
            $output = new stdClass();
            $output->processes = ($procstatus ? $procstatus : []);
            $output->backend = ($daemonstatus ? $daemonstatus : new stdClass());
            $output->timestamp = $currenttime;

            // the SSE string
            $ssestring = $this->_formSSE(json_encode($output));

            // update the lastupdate property and increment the sequence number
            $this->lastupdate = $currenttime;
            $this->seq++;
        }

        return $ssestring;
    }


    /************
     * getProcessStatus
     *
     * runs the "pgrep" command and returns an object with the results
     ***********/
    function getProcessStatus(): ?object {

        // where we'll store the output
        $results = Array();

        try {
            $cmdoutput = shell_exec($this->command);
            if ($cmdoutput) {
                
                // temp holding area
                $procstatus = Array();

                // split the string returned at each newline
                $lines = explode("\n", $cmdoutput);

                // iterate over each line
                foreach ($lines as $l) {

                    // split the line on the space character and save the results in our temp array
                    $parts = explode(" ", $l);
                    if ($parts[0] != "" && $parts[1] != "")
                        $procstatus[$parts[1]] = $parts[1];
                }

                // form up the JSON
                foreach($procstatus as $p) {
                    $results[] = Array(
                        "process" => $p,
                        "active" => 1
                    );
                }
            }
        } catch (Exception $e) {
            print_r($e);
            return null;
        }

        return (object) $results;
    }
    

    /************
     * getHabtrackerStatus
     *
     * reads in the daemonstatus.json file
     ***********/
    function getHabtrackerStatus(): ?object {

        // read the daemonstatus.json file
        if(($cmdoutput = @file_get_contents($this->jsonstatusfile)) === false) {
            return null;
        }

        // if nothing back, just return null
        if ($cmdoutput == null) {
            return null;
        }

        // convert the returned JSON to a PHP object
        return json_decode($cmdoutput, false);
    }

}

?>



