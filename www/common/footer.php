<!-- beginning of footer -->
<div class="footer">
    <?php
        $documentroot = $_SERVER["DOCUMENT_ROOT"];
        include_once $documentroot . '/common/functions.php';
        include_once $documentroot . '/common/version.php';
    ?>
    <p class="copyright" style="margin-top:  10px; margin-bottom:  0px;">
    This site best viewed with recent versions of Firefox, Safari, Internet Explorer, Chrome, Opera, etc.
    </p>
    <p class="copyright" style="margin-bottom:  10px;">
    System Version: <?php if (isset($version)) printf("%.1f", $version); ?> 
    </p>
</div>
<!-- end of footer -->


