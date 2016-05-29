import angular from 'angular';
import 'angular-route';

import categoryQueryModule from '../../queries/category/getCategories';
import categoryTreeCommandModule from '../../commands/category/generateCategoryTree';
import lowestCategoriesCommandModule from '../../commands/category/findAllBottomLevelCategories';
import navbarAppModule from '../../navbar/navbar';
import autocomplete from 'JustGoscha/allmighty-autocomplete';

export default angular.module('CreateListingControllerModule', [
    categoryQueryModule.name,
    categoryTreeCommandModule.name,
    navbarAppModule.name,
    autocomplete.name,
    lowestCategoriesCommandModule.name
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