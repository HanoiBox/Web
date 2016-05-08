import angular from 'angular';
import 'angular-route';

import categoryQueryModule from '../../queries/category/getCategories';
import categoryTreeCommandModule from '../../commands/category/generateCategoryTree';
import navbarAppModule from '../../navbar/navbar';
import 'angular/bower-angular-sanitize';
import 'allenhwkim/angularjs-autocomplete';
//angularjsAutocomplete from 

export default angular.module('CreateListingControllerModule', [
    categoryQueryModule.name,
    categoryTreeCommandModule.name,
    navbarAppModule.name,
    'angularjs-autocomplete'
]).controller('CreateListingController', function($scope, allCategories, $location, $http, GenerateCategoryTree) {
    $scope.categoriesSelection = allCategories.map(cat => {
        // return { id: cat._id, value: cat.vietDescription, title: cat.description }
        return { id: cat._id, value: cat.description };
    });
    GenerateCategoryTree.generate(allCategories, null, (categories) => {
        $scope.topCats = categories;
    });
    
    $scope.doNotShowCreateListingButton = true;
    $scope.advert;
    
    $scope.listFormatter = (el, scope) => {
        return `<li value=\"${el.id}\">${el.value}</li>`;
    };
    
    $scope.setCategory = (value) => {
        console.log(value);
        //$scope.categorySelected = "";
    };
    
    $scope.save = (advert) => {
        if (!$scope.createListingForm.$valid)
        {
            return;
        }
        let url = "/api/listing/";
        let config = {
            data: advert
        };
        $http.post(url, config).then((response) => { 
            $scope.formSubmitted = true;
        }, (response) => {
            $scope.errors = true;
            $scope.errorMessage = "Unfortunately something went wrong submitting your listing";   
        });
    };
});