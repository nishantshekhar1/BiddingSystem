angular.module('app')
    .controller('MCtrl', function ($scope, BidService,toastr) {
        $scope.title = " Post a request";
        $scope.disabled = false;
        $scope.btnName = "Create Post";
        $scope.btndisable = false;
        $scope.isMine = true;
       // document.location.reload();
        $scope.submit = function () {
            BidService.savePost($scope.post)
                .then(function () {
                    toastr.success("The post has been successfully saved");
                    $scope.reset();
                }, function (error) {
                    toastr.error(error.data.message, error.status);
                });
        };

        $scope.reset = function () {
            if ($scope.post === undefined) {
                $scope.post = {};
            }
            $scope.post.title = "";
            $scope.post.description = "";
            $scope.post.price = 0;
        };

        $scope.reset();
      // document.location.reload();
    });
