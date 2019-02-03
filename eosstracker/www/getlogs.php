<?php
    session_start();
    $documentroot = $_SERVER["DOCUMENT_ROOT"];
    include $documentroot . '/common/functions.php';
    include $documentroot . '/common/sessionvariables.php';

    $logfile = "/eosstracker/logs/start_session.log";
    $errfile = "/eosstracker/logs/start_session.log.stderr";
    $log = file($logfile);
    $err = file($errfile);
    printf("{\"log\": %s, \"err\": %s}", json_encode($log), json_encode($err));
?>

