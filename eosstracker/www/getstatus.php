<?php
    session_start();
    $documentroot = $_SERVER["DOCUMENT_ROOT"];
    include $documentroot . '/common/functions.php';
    include $documentroot . '/common/sessionvariables.php';

    $cmdoutput = shell_exec('/eosstracker/bin/procstatus.py');
    if ($cmdoutput == null) {
        printf ("[]");
        return 0;
    }
 
    printf("%s", $cmdoutput);
?>

