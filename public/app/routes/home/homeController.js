import angular from 'angular';
import 'angular-route';

import categoryQueryModule from '../../queries/category/getCategories';
import navbarAppModule from '../../navbar/navbar';

export default angular.module('HomeControllerModule', [
    categoryQueryModule.name,
    navbarAppModule.name
]).controller('HomeController', function($scope, allCategories, $location, $http) {
    $scope.categories = allCategories;
    this.topCats = $scope.categories.filter(cat => cat.level === 0);
    //this.firstLevelCats = $scope.categories.filter(cat => cat.level === 1);
    // $scope.categoryTabs = this.topCats.map(topCat => {
    //     let subCategories = $scope.categories.filter(cat => cat.parentCategoryId === topCat._id);
    //     return { id: topCat._id, title: topCat.description, categories: subCategories };
    // });
    
    // $scope.selectCategory = (id) => {
    //     let activeTab = $scope.categoryTabs.find(catTab => catTab.id === id);
    //     activeTab.active = true;
    //     //$scope.categoryTabs.push(activeTab);
    //     //if (catTab.categories === undefined) {
    //         //this.loadSubCategories(id);    
    //     //}
    //     //console.log("doing nothing");
    //     // $scope.categoryTabs = $scope.topCategories.map(topCat => {
    //     //     let subCategories = $scope.categories.filter(cat => cat.parentCategoryId === topCat._id);
    //     //     return { id: topCat._id, title: topCat.description, categories: subCategories };
    //     // });
    // }
    $scope.topCats = this.topCats.map(topCat => {
        let firstSubCategories = $scope.categories.filter(cat => cat.parentCategoryId === topCat._id && cat.level === 1);
        let tree = firstSubCategories.map(firstCat => {
            let subCategories = $scope.categories.filter(cat => cat.parentCategoryId === firstCat._id);
            let subCatsConvertedToSubTree = subCategories.map(subCat => {
                let linkUrl = '/category/id=' + subCat._id;
                return { name: subCat.description, link: linkUrl, subtree: null };
            });
            let topLinkUrl = '/category/id=' + firstCat._id;
            return { name: firstCat.description, link: topLinkUrl, subtree: subCatsConvertedToSubTree };
        });
        
        return {
            description: topCat.description,
            tree
        };
    });
    
    // $scope.tree = [{
    //     name: "States",
    //     link: "#",
    //     subtree: [{
    //         name: "state 1",
    //         link: "state1",
    //         subtree: [{name: "state 1",
    //         link: "state1"}]
    //     }, {
    //         name: "state 2",
    //         link: "state2"
    //     }]
    // }, {
    //     name: "No states",
    //     link: "#",
    //     subtree: [{
    //         name: "no state connected",
    //         link: "#"
    //     }]
    // }, {
    //     name: "divider",
    //     link: "#"
    // }, {
    //     name: "State has not been set up",
    //     link: "#"
    // }];
});