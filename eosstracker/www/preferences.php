<?php
    session_start();
    $documentroot = $_SERVER["DOCUMENT_ROOT"];
    include $documentroot . '/common/functions.php';
    include $documentroot . '/common/sessionvariables.php';

/*    print_r ($_GET);
    printf ("<BR>");
    print_r ($_SESSION);
    printf ("<BR>");
*/

    $referer = $_SERVER["HTTP_REFERER"];

    header ("Location:  " . $referer);
?>
