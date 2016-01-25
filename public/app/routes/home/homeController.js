import angular from 'angular';
import 'angular-route';

import categoryQueryModule from '../../queries/category/getCategories';

export default angular.module('HomeControllerModule', [
    categoryQueryModule.name
]).controller('HomeController', function($scope, allCategories, $location, $http) {
    $scope.categories = allCategories;
    this.topCats = $scope.categories.filter(cat => cat.level === 0);
    $scope.categoryTabs = this.topCats.map(topCat => {
        let subCategories = $scope.categories.filter(cat => cat.parentCategoryId === topCat._id);
        return { id: topCat._id, title: topCat.description, categories: subCategories };
    });
    
    $scope.selectCategory = (id) => {
        let activeTab = $scope.categoryTabs.find(catTab => catTab.id === id);
        activeTab.active = true;
        //$scope.categoryTabs.push(activeTab);
        //if (catTab.categories === undefined) {
            //this.loadSubCategories(id);    
        //}
        //console.log("doing nothing");
        // $scope.categoryTabs = $scope.topCategories.map(topCat => {
        //     let subCategories = $scope.categories.filter(cat => cat.parentCategoryId === topCat._id);
        //     return { id: topCat._id, title: topCat.description, categories: subCategories };
        // });
    }
    
    
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