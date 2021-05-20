angular.module('app')
    .controller('BidCtrl', function ($scope, $stateParams,BidService,toastr,$timeout,NgTableParams,$rootScope) {
        $scope.title = " Bid for this post";
        $scope.disabled = true;
        $scope.btnName = "Bid Now";
        $scope.btndisable = true;
        $scope.isMine = false;
        $scope.tableDisplay = false;

        var init = function(){
            BidService.getIsMyPost($stateParams.postId)
                .then(function(response){
                    $scope.isMine = !(response.data.isMyPost);
                },function () {
                    toastr.error(error.data.message, error.status);
                });
            BidService.getPostbyId($stateParams.postId)
                .then(function(res){
                    BidService.getBidsbyPostId(res.data._id)
                        .then(function(response){
                            $scope.dataSet = response.data;
                            $scope.tableDisplay = ($scope.dataSet.length!==0);
                            $timeout(function(){
                                $scope.tableParams = new NgTableParams({
                                    // initial sort order
                                    sorting: { createdAt: "desc" }
                                }, {
                                    dataset: $scope.dataSet
                                });
                            });
                        },function(error){
                            toastr.error(error.data.message, error.status);
                        });
                    $scope.post = res.data;
                    $scope.title = $scope.post.title;
                    $scope.btndisable = false;

                },function(error){
                    toastr.error(error.data.message, error.status);
                });
        };

        $scope.convert= function(date){
            return moment(date).fromNow();
        };

        $scope.submit=function(){
            $('#squarespaceModal').modal({backdrop: 'static', keyboard: false});
        };

        $scope.saveBid = function(){
            BidService.saveBid($scope.post._id,$scope.bidInfo)
                .then(function(response){
                    $scope.reset();
                    $('#squarespaceModal').modal('hide');
                    init();
                },function(error){
                    toastr.error(error.data.message, error.status);
                });
        };



        $scope.reset = function() {
            if ($scope.bidInfo === undefined)
                $scope.bidInfo = {};
            $scope.bidInfo.bidPrice = 0;
            $scope.bidInfo.additionalDesc = "";
            $scope.bidInfo.quantity = 1;
        };

        $scope.reset();
        init();
    });
