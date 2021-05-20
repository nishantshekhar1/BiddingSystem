angular.module('app')
    .factory('BidService', function ($http) {
        return {
            savePost: function (postData) {
                return $http.post(appSettings.serviceURL + '/api/post',postData);
            },
            getAllPosts: function () {
                return $http.get(appSettings.serviceURL + '/api/post');
            },
            getMyPosts: function () {
                return $http.get(appSettings.serviceURL + '/api/myposts');
            },
            getMyBids: function () {
                return $http.get(appSettings.serviceURL + '/api/allbids');
            },
            getPostbyId:function(id){
                return $http.get(appSettings.serviceURL+'/api/post/'+id);
            },
            // added for deleting post by id
            deletePostbyId:function(id){
                return $http.get(appSettings.serviceURL+'/api/myposts/delete/'+id);
            },
            deleteBidbyId:function(id){
                return $http.get(appSettings.serviceURL+'/api/mybids/delete/'+id);
            },
            saveBid:function(postId,bidData){
                return $http.post(appSettings.serviceURL+'/api/'+postId+'/bid',bidData)
            },
            getBidsbyPostId:function(id){
                return $http.get(appSettings.serviceURL+'/api/bids/'+id);
            },
            getIsMyPost:function(id){
                return $http.get(appSettings.serviceURL+'/api/isMyPost/'+id);
            }
        };
    });