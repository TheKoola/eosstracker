## refactoring goals for the eosstracker project
This is a large refactor with overall end-state goals for the backend being:
- the backend to be completely Rust-based (no longer python) 
    + Provides web-accessible end points/api (ex. /api/config, /api/sse, etc.) emit SSE events to connected we browsers
    + listens on the localhost IP address (ex. http://127.0.0.1:3000) which would then be proxied through the local Apache webserver for outside access.
    + Connects to a running instance of aprs-streamd (usually deployed on the local machine) to listen for incoming APRS packets (leverages the aprs-stream CBOR functionality to receive structs with packet info).  Will require leveraging the aprs-stream components/definitions from https://www.github.com/deatojef/aprs-stream, but is also locally cloned in /home/jeffdeaton/aprs-stream for reference.
    + Unlike the existing python backend, no interfacing with an attached RTL-SDR USB dongle is required, using python gnuradio libraries to demodulate FM, or any sort of AX.25/APRS decoding through the python aprslib library.  Essentially all packet demod/decode operations are handled externally through the aprs-streamd instance and the new backend simply listens for packets over the multicast IP address provided in /etc/aprs-streamd/config.toml.
    + Also unlike the existing python backend, no postgresql or postgis dependencies are required.  The new Rust-based backend will leverage native_db to save incoming packets, keeping only the past 24hours.
    + the native_db database would also maintain other configuration information and state data in the legacy postgresql tables:
        - trackers
        - flights
        - flightmap
        - gpsposition
        - launchsites
        - teams
    + No need to run other external processes.  The legacy backend starts direwolf and aprsc - there's no need to run either of those.  
        - functionality provided by direwolf includes RF/inet beaconing and igating (to aprsc).  that functionality would be initially tabled and perhaps revisited at a future date.
        - aprsc provides connectivity to noam.aprs2.net and allows for igating and ingestion of packets over the internet.  That functionality would be initially tabled and perhaps revisited at a future date.
- apache still serves the /eosstracker/www and proxies the localhost (ex. http://127.0.0.1:3000) through the /api endpoint.
