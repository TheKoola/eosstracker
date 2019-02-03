<?php
    session_start();
    $documentroot = $_SERVER["DOCUMENT_ROOT"];
    include $documentroot . '/common/functions.php';
    include $documentroot . '/common/sessionvariables.php';
 
    $shutdown_script = "/eosstracker/bin/killsession_wrapper.bash";

    $output = shell_exec('sudo -b -u eosstracker ' . $shutdown_script);
    //printf ("%s", json_encode($output);

    printf ("[]");
?>
