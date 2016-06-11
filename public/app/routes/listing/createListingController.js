import angular from 'angular';
import 'angular-route';

import categoryQueryModule from '../../queries/category/getCategories';
import categoryTreeCommandModule from '../../commands/category/generateCategoryTree';
import lowestCategoriesCommandModule from '../../commands/category/findAllBottomLevelCategories';
import navbarAppModule from '../../navbar/navbar';
import autocomplete from 'JustGoscha/allmighty-autocomplete';
import 'leon/angular-upload';

export default angular.module('CreateListingControllerModule', [
    categoryQueryModule.name,
    categoryTreeCommandModule.name,
    navbarAppModule.name,
    autocomplete.name,
    lowestCategoriesCommandModule.name,
    'lr.upload'
]).controller('CreateListingController', function($scope, allCategories, $location, $http, GenerateCategoryTree, BottomLevelCategories) {
    
    $scope.lowestLevelCategories = BottomLevelCategories.findAll(allCategories);
    $scope.categoriesSelection = $scope.lowestLevelCategories.map((cat) => cat.vietDescription);
    GenerateCategoryTree.generate(allCategories, null, (categories) => {
        $scope.topCats = categories;
    });
    
    $scope.doNotShowCreateListingButton = true;
    $scope.advert;
    $scope.errors = false;
    $scope.formSubmitted = false;
    $scope.image1IsAvailable = false;

    $scope.onUploadSuccess = (response) => {
        let res = response.data;
        if (res.success)
        {
            $scope.image1Name = res.name;
            $scope.image1Url = res.url.replace('upload', 'upload/w_100');
            $scope.image1IsAvailable = true;
        } else {
            $scope.image1IsAvailable = false;
            alert("Unable to upload, please try again or if it persists, report this problem to support.");
        }
    };

    $scope.onUploadSuccessImage2 = (response) => {
        let res = response.data;
        if (res.success)
        {
            $scope.image2Name = res.name;
            $scope.image2Url = res.url.replace('upload', 'upload/w_100');
            $scope.image2IsAvailable = true;
            //this.CheckAndDisableUploads();
        } else {
            $scope.image2IsAvailable = false;
            alert("Unable to upload, please try again or if it persists, report this problem to support.");
        }
    };
    
    $scope.save = (advert) => {
        if (!$scope.createListingForm.$valid)
        {
            if ($scope.createListingForm.categorySelected.$valid === false) {
                $scope.errors = true;
                $scope.errorMessage = "Please select a category";    
            } else {
                $scope.errors = false;
            }
            return;
        }
        
        advert.category = $scope.lowestLevelCategories.find(c => c.vietDescription === advert.categorySelected);
        $scope.errors = false;
        let url = "/api/listing/";
        let config = {
            data: advert
        };
        $http.post(url, config).then((response) => {
            console.log(response.message); 
            $scope.formSubmitted = true;
        }, (response) => {
            $scope.formSubmitted = false;
            $scope.errors = true;
            $scope.errorMessage = "Unfortunately something went wrong submitting your listing";   
        });
    };
});