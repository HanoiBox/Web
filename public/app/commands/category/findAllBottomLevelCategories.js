import angular from 'angular';
import 'babel/polyfill';

export default angular.module('categoryUtilitiesCommandModule', [])
.factory('BottomLevelCategories', function() {
    
    let thisIsALowestLevelCategory = function* (candidateCategory) {
        if (candidateCategory._id === 1)
        {
            yield(false);
        }
        yield(true);
    };
    
    let iterateThroughCategories = (categories) => {
        let listOfLowCategories = [];
        
        for (var category of categories) {
            let isLowest = thisIsALowestLevelCategory(category).next();
            if (isLowest.value)
            {
                listOfLowCategories.push(category);
            }
        }
        return listOfLowCategories;
    };
    
    let bottomLevelCategoryFinder = (categories) => {
        var filteredCategories = categories.filter(c => c.level !== 0);
        
        return iterateThroughCategories(filteredCategories);
    };
    
    return {
        findAll: bottomLevelCategoryFinder
    }
});