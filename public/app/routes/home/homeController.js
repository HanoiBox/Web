import angular from 'angular';
import 'angular-route';

import categoryQueryModule from '../../queries/category/getCategories';

export default angular.module('HomeControllerModule', [
    categoryQueryModule.name
]).controller('HomeController', function($scope, allCategories, $location, $http) {
    $scope.categories = allCategories;
    $scope.topCategories = $scope.categories.filter(cat => cat.level === 1);
    
    this.selectedCategory = (id) => {
        console.log('selected category was:', id);
    };
    
    this.loadSubCategories = (id) => {
       let subCategories = $scope.categories.filter(cat => cat.parentCategoryId === id);
       $scope.categoryTabs = $scope.categoryTabs.map(tab => tab.categories = subCategories);
       console.log($scope.categoryTabs);
    }
    
    $scope.selectSubCategories = (id) => {
        console.log('id was:', id);
        this.loadSubCategories(id);
    }
    
    $scope.categoryTabs = $scope.topCategories.map(cat => {
        return { id: cat._id, title: cat.description, categories: $scope.categories };
    });
    //  [{
    //     title: "one",
    //     active: true,
    //     disabled: false,
    //     content: "test"   
    // }, {
    //     title: "two",
    //     active: true,
    //     disabled: false,
    //     content: "hello"   
    // }];
});