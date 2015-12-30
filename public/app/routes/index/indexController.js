import angular from 'angular';
import categoryQueryModule from 'sysadmin/app/queries/getCategories';

export default angular.module('indexControllerModule', [
    categoryQueryModule.name
]).controller('IndexController', function($location, $scope, allCategories) {
    
    this.allCategories = allCategories.data.categories;
    console.log(this.allCategories);
    this.topCategories = this.allCategories.filter(cat => cat.level === 0);
    console.log(this.topCategories);
    $scope.tabs = this.topCategories.map(cat => {
        return { title: cat.description, content: cat.description }
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