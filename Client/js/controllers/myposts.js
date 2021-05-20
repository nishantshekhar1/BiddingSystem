angular.module('app')
    .controller('MyPostsCtrl', function ($scope, $auth, toastr, $timeout, BidService, NgTableParams,$location) {
        var getPosts = function() {
            BidService.getMyPosts().then(function (data) {
                // params.total(data); // recal. page nav controls
                $scope.dataSet = data.data;
                $timeout(function () {
                    $scope.tableParams = new NgTableParams({
                        // initial sort order
                        sorting: {createdAt: "desc"}
                    }, {
                        dataset: $scope.dataSet
                    });
                });
            });

        };

        $scope.delete = function (data) {
            BidService.deletePostbyId(data._id)
                .then(function () {
                    toastr.success("The post has been successfully deleted");
                    // $scope.view(datar);
                    getPosts();
                }, function (error) {
                    toastr.error(error.data.message, error.status);
                });
        };


        $scope.convert= function(date){
            return moment(date).fromNow();
        };

        $scope.view= function(data){
            $location.path('/user/bid/'+data._id);
        };

        getPosts();
    });
