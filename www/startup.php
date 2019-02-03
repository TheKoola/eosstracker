<?php
    session_start();
    $documentroot = $_SERVER["DOCUMENT_ROOT"];
    include $documentroot . '/common/functions.php';
    include $documentroot . '/common/sessionvariables.php';
    
    $startup_script = "/eosstracker/bin/start_session.bash";

    $output = shell_exec('sudo -b -u eosstracker ' . $startup_script);
    //printf ("%s", json_encode($output));
    //printf ("[]");
    printf ("%s", $output);
?>
