<?php
    session_start();
    $documentroot = $_SERVER["DOCUMENT_ROOT"];
    include $documentroot . '/common/functions.php';
    include $documentroot . '/common/sessionvariables.php';

    $logfile = "/eosstracker/logs/start_session.log";
    $errfile = "/eosstracker/logs/start_session.log.stderr";
    if (is_readable($logfile)) {
        $log = file($logfile);
        if ($log === false)
            $log = "Not available.";
    }
    else
	$log = "Not available.";
    if (is_readable($errfile)) {
        $err = file($errfile);
        if ($err === false)
            $err = "Not available.";
    }
    else
	$err = "Not available.";

    printf("{\"log\": %s, \"err\": %s}", json_encode($log), json_encode($err));
?>

