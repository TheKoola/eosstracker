<?php

// we need the database functions 
if (array_key_exists("CONTEXT_DOCUMENT_ROOT", $_SERVER))
    $documentroot = $_SERVER["CONTEXT_DOCUMENT_ROOT"];
else
    $documentroot = $_SERVER["DOCUMENT_ROOT"];

include_once $documentroot . '/common/functions.php';
include_once $documentroot . '/common/trackers.php';


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

    // default function.  To be overloaded by sub-classes
    // Should return true on success, false on some error.
    function close(): ?bool {
        return True;
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

        // the current time.  Which we'll use to compare to the timestamp (in the GPS json) to determine if the results are stale or not.
        $currenttime = microtime(true);

        // extract the EPOCH seconds from the returned geojson
        $gpstimestamp = $this->getMicroSecs($js);

        // determine if the timestamp from the gpsstatus.json file is stale.
        $staledata = (($currenttime - $gpstimestamp) > $this->threshold * 2 ? true : false);

        // if the status file is stale (i.e. been laying around since a prior system crash or other issue) then we just return null as the
        // data is unusable
        if ($staledata)
            return null;

        // set the source
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
        $defaultsJSON = file_get_contents($this->defaultsfile);
        if ($defaultsJSON === false)
            $defaults = json_decode($fallbackJSON, true);
        else 
            $defaults = json_decode($defaultsJSON, true);


        // Get the configuration data from config.txt
        $configJSON = file_get_contents($this->configfile);
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
     * updateMemcache
     *
     * update the 'configuration' memcache key with the provided JSON data
     ***********/
    private function updateMemcache($jsondata): ?bool {

        // default results
        $results = false;

        try {

            // create a new memcache object and connect to the backend daemon
            $memcache = new Memcache;
            $connectionresult = $memcache->connect('localhost', 11211);
            if (!$connectionresult)
                throw new Exception("memcache fail");

            // attempt to get the configuration key from memcache
            $getresult = $memcache->get('configuration');

            // if the key already exists within memcache, then we replace what's there
            if ($getresult) {
                // now add this to memcache with a TTL of 900 seconds.
                $results = $memcache->replace('configuration', $jsondata, false, 900);
            }

            // otherwise, we add this key
            else {

                // now add this to memcache with a TTL of 900 seconds.
                $results = $memcache->add('configuration', $jsondata, false, 900);
            }

            // close the memcache connection.
            $memcache->close();

        } catch (Exception $e) {

            // close the memcache object, just in case
            $memcache->close();
        }

        return $results;
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

            // since the configuration data wasn't within memcache, we add it now...
            $this->updateMemcache(json_encode($js));

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
        $js = json_decode($cmdoutput, false);

        return $js;
    }

}

/*********************
 * LogEvent class that checks for updates to the backend logs
 *
 * Usage:
 * $mylogs = new LogEvent("direwolf.out");
 * $ssetext = $mylogs->generateSSEEvent();
 * if ($ssetext)
 *     sendSSEText($ssetext);
 *
 *********************/
class LogEvent extends BaseSSEEvent {

    // properties
    private string $logfile;       // file and path to the log file of interest
    private int $last_location;    // location in bytes of where the last read from the log file ended.

    // constructor
    function __construct(string $id, string $logfile, int $threshold = 15) {
        parent::__construct($id, $threshold);

        // log file location
        $this->logfile = $logfile;

        // initial position within the log file to start reading from
        $this->last_location = 0;
    }

    /************
     * generateSSEText
     *
     * construct the SSE text (json) for this event.  Return null if there isn't anything we need to send to the browser.
     ***********/
    function generateSSEText(): ?string {

        // checks that the file exists and is readable
        if (!is_readable($this->logfile))
            return null;

        // where we store the SSE formed JSON text.
        $ssestring = null;

        // clear file stats cache and get new data
        clearstatcache();
        $stats = stat($this->logfile);

        // determine the log file size in bytes
        $current_file_size = $stats["size"];

        // if the current file size is < the last_location then something happened to truncate or recreate the log file.  In that
        // case reset the last_location back to 0 as we're effectively starting over monitoring a new log file.
        $filechanged = false;
        if ($current_file_size < $this->last_location) {
            $filechanged = true;
            $this->last_location = 0;
        }

        // read from the log file if this is the first time being called or there is new data available.
        if ($this->seq == 0 || $current_file_size > $this->last_location) {
            
            // grab trailing lines from the log file
            $logfile_content = $this->readLogFile($this->logfile, $this->last_location);

            // if data was returned 
            if ($logfile_content) {

                // construct the SSE string if data was returned
                if ($logfile_content->bytes > 0) {

                    // the content from the log file
                    $content = $logfile_content->lines;

                    // if the log file has been recreated, then we insert a separater line so the user knows where the new log began
                    if ($filechanged) 
                        $content = "=================== log file changed ==================\n" . $content;

                    // create the SSE event string
                    $ssestring = $this->_formSSE(json_encode($content));

                    // set the last_location to the ending read position within the log file
                    $this->last_location = $logfile_content->endingloc;

                    // increment the sequence #
                    $this->seq++;
                }
            }
        }

        return $ssestring;
    }

    // Read from the end of a log file one small chunk at a time returning at most 100 lines.  
    //
    // Optionally can supply a starting location (in bytes) from where to beginning reading from.  The word "starting" is a misnomer as
    // that actually specifies where to stop reading - will read from EOF (backwards as it were) until hitting the $startingloc 
    // or 100 lines are read, which ever comes first.
    //
    // Returns an object if successful:
    //    obj->endingloc  // byte location within the file where reading ended
    //    obj->lines      // the data being returned 
    //    obj->numlines   // number of lines being returned (more accurately, the number of newline characters counted in the output)
    //    obj->bytes      // the number of bytes being returned
    //
    // Otherwise, if unable to open or access the file for reading then null is returned
    //
	private function readLogFile($filepath, $startingloc = 0) {

        // by default, limit the maximum number of lines returned
        $MAX_LINES = 100;

		// Open file.  return if we can't open
		$f = fopen($filepath, "r");
        if ($f === false) 
            return null;

        // get size of the file.  
        $fsize = fstat($f)["size"];

        // sanity check.  boundaries for starting location
        if ($startingloc > $fsize)
            $startingloc = $fsize;
        if ($startingloc < 0)
            $startingloc = 0;

		// set buffer size to the size we're needing to retrieve from the file, if $startingloc == 0, then just default to some small size
        $bufsize = ($fsize - $startingloc > 0 && $startingloc > 0 ? ($fsize - $startingloc) * 1.2 : 4096);

        // move to the end of the file
        fseek($f, 0, SEEK_END);

		// loop initialization variables
		$output = "";          // cumlative output where we store the lines read from the file
        $block = "";           // temp location that holds data read from the file each time through the loop
        $done = false;         // flag that signals to end the loop
        $lines = 0;            // number of lines read...added to each time through the loop

		// loop, collecting all lines from the file into $output 
		while (!$done && ftell($f) > 0 && $lines <= $MAX_LINES) {

            // how far away from the specified starting point or the beginning of the file?
            $seek = min(ftell($f) - $startingloc, $bufsize);

			// position the file pointer backwards by $seek amount
			fseek($f, -$seek, SEEK_CUR);

            // is this location at our starting position?  If yes, then set the loop ending flag.
            if (ftell($f) == $startingloc) 
                $done = true;

			// Read a block from this location and prepend it to $output
            $block = fread($f, $seek);
			$output = $block . $output;

            // rewind back to where we started reading from within the prior loop instance.
			fseek($f, -strlen($block), SEEK_CUR);
             
            // count the number of newlines encountered in the block we just read.  We do this so we can limit the lines to $MAX_LINES or less.
            $n = substr_count($block, "\n");

            // increment the total lines counter
			$lines += $n;
		}

		// Close the file
		fclose($f);

        // find the last newline and remove all text after that newline so we end at a whole line.
        $output = substr($output, 0, strrpos($output, "\n") + 1);

        // if the starting location was 0, then we want to limit the output to $MAX_LINES
        // this will trim off lines from the beginning of $output until we get to <= $MAX_LINES
        if ($startingloc == 0)
            while ($lines-- > $MAX_LINES + 1) 
                $output = substr($output, strpos($output, "\n") + 1);
        //else
            // otherwise, find the first newline and remove all text before that so we begin at a whole line.
            //$output = substr($output, strpos($output, "\n") + 1);

        // trim up the output
        $output = trim($output);

        // create an object to return
        $contents = new stdClass();
        $contents->endingloc = $fsize;
        $contents->lines = $output;
        $contents->numlines = substr_count($output, "\n");
        $contents->bytes = strlen($output);

		return $contents;
	}
}

/*********************
 * PacketEvent class that checks for new packets from the backend
 *
 * Usage:
 * $mypackets = new PacketEvent();
 * $ssetext = $mypackets->generateSSEEvent();
 * if ($ssetext)
 *     sendSSEText($ssetext);
 *
 *********************/
class PacketEvent extends BaseSSEEvent {

    // properties
    protected $dblink;       // postgresql database connection

    // constructor
    function __construct(int $threshold = 15) {
        parent::__construct("packets", $threshold);

        // connect to the database
        $this->dblink = connect_to_database();

        // start listening for postgresql NOTIFY events
        if ($this->dblink) 
            pg_query($this->dblink, "LISTEN new_packet;");
    }


    /************
     * generateSSEText
     *
     * construct the SSE text (json) for this event.  Return null if there isn't anything we need to send to the browser.
     ***********/
    function generateSSEText(): ?string {

        // where we store the SSE formed JSON text.
        $ssestring = null;
        $results = null;

        try {
            if (!$this->dblink)
                $this->dblink = connect_to_database();

            // The result from our postgresql LISTEN command.
            $results = pg_get_notify($this->dblink);

        } catch (Exception $e) {
            return $this->_formSSE("unable to get nofity results: " . db_error(sql_last_error()));
        }

        // check if notifications from the postgresql database were sent
        if ($results) {

            // the JSON content returned from postgresql
            $content = $results["payload"];

            if ($content) {
                // create the SSE event string
                $ssestring = $this->_formSSE($content);

                // increment the sequence #
                $this->seq++;
            }
        }

        return $ssestring;
    }
}


/*********************
 * TrackerEvent class
 *
 * Usage:
 * $mytrackers = new TrackerEvent();
 * $ssetext = $mytrackers->generateSSEEvent();
 * if ($ssetext)
 *     sendSSEText($ssetext);
 *
 *********************/
class TrackerEvent extends BaseSSEEvent {

    // properties
    private float $lasttimestamp;  // timestamp from the trackers data set
    protected $dblink;             // postgresql database connection

    // constructor
    function __construct(int $threshold = 15) {
        parent::__construct("trackers", $threshold);

        // set the lasttimestamp to zero
        $this->lasttimestamp = 0.0;
    }

    /************
     * getBackendTrackers
     *
     * Read from the backend database to get a list of tactical teams and the trackers associated with them.
     ***********/
    function getBackendTrackers(string $flightid = null): ?object {
        return getTrackersFromDB($flightid, true);  // add 'true' for the 2nd parameter to instruct the getTrackersFromDB function to leave the DB connection open.
    }

    /************
     * generateSSEText
     *
     * construct the SSE text (json) for this event.  Return null if there isn't anything we need to send to the browser.
     ***********/
    function generateSSEText(): ?string {

        // where we store the SSE formed JSON text.
        $ssestring = null;

        // where we'll store the results
        $js = new stdClass();

        // status of our memcache attempt
        $cache_status = null;

        try {

            // create a new memcache object and connect to the backend daemon
            $memcache = new Memcache;
            $connectionresult = $memcache->connect('localhost', 11211);
            if (!$connectionresult)
                throw new Exception("memcache fail");

            // attempt to get the key from memcache
            $getresult = $memcache->get('trackers');
            if ($getresult) {

                // convert the returned JSON to a PHP object
                $js = json_decode($getresult, false);
                $cache_status = "cache hit";
            }
            else {
                // cache miss.  Now get the list of trackers from the backend
                $js = $this->getBackendTrackers();
                $cache_status = "cache miss";

                // now add this to memcache with a TTL of 900 seconds.
                $memcache->set('trackers', json_encode($js), false, 100);
            }

            // close the memcache connection.
            $memcache->close();

        } catch (Exception $e) {

            // close the memcache object, just in case
            $memcache->close();

            // get the list of trackers from the backend
            $js = getBackendTrackers();
            $cache_status = "exception:  " . $e;
        }

        // if there was a timestamp and a trackers key returned...
        if (property_exists($js, "timestamp") && property_exists($js, "trackers")) {

            // only update the browser if the timestamp from the trackers json is > than the lasttimestamp 
            if ($js->timestamp > $this->lasttimestamp) {

                // update the lasttimestamp property
                $this->lasttimestamp = $js->timestamp;

                // add the cache status key/value pair
                $js->memcache_status = $cache_status;

                // create the SSE event string
                $ssestring = $this->_formSSE(json_encode($js));

                // increment the sequence #
                $this->seq++;
            }
        }

        return $ssestring;
    }
}

?>
