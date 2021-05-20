$(function() {

    /**
     * https://www.abeautifulsite.net/vertically-centering-bootstrap-modals
     * Vertically center Bootstrap 3 modals so they aren't always stuck at the top
     */
    function reposition() {
        var modal = $('#globalmessagebox'),
            dialog = modal.find('.modal-dialog');
        modal.css('display', 'block');

        // Dividing by two centers the modal exactly, but dividing by three
        // or four works better for larger screens.
        dialog.css("margin-top", Math.max(0, ($(window).height() - dialog.height()) / 2));
    }
    // Reposition when a modal is shown
    $('.modal').on('show.bs.modal', reposition);
    // Reposition when the window is resized
    $(window).on('resize', function() {
        $('.modal:visible').each(reposition);
    });

    $('#modalClose').on('click',function(){
        var scope = angular.element('#view').scope();
        scope.vm.globalmodalclose();
    });
});

