import angular from 'angular';
import 'babel/polyfill';

export default angular.module('categoryUtilitiesCommandModule', [])
.factory('BottomLevelCategories', function() {
    
    let getLowestCategories = function* (candidateCategory, allCategories) {
        let lowerCategories = allCategories.filter(c => c.parentCategoryId === candidateCategory._id);
        
        if (Array.isArray(lowerCategories) && lowerCategories.length !== 0) {
            for(let i=0; i < lowerCategories.length; i++) {
                yield* getLowestCategories(lowerCategories[i], allCategories); // (*) recursion
            }
        } else {
            // lowest
            yield candidateCategory;
        }
    };
    
    let bottomLevelCategoryFinder = (categories) => {
        let listOfLowCategories = [],
            topLevelCategories = categories.filter(c => c.level === 0),
            otherCategories = categories.filter(c => c.level !== 0);
            
        for (var topLevelCategory of topLevelCategories) {
            let firstLevelCategories = otherCategories.filter(c => c.parentCategoryId === topLevelCategory._id);
            if (Array.isArray(firstLevelCategories) && firstLevelCategories.length > 0) {
                for (var firstLevelCategory of firstLevelCategories) {
                    for (var category of getLowestCategories(firstLevelCategory, otherCategories)) {
                        listOfLowCategories.push(category);
                    }
                }
            } else {
                listOfLowCategories.push(topLevelCategory);
            }
        }
        
        return listOfLowCategories;
    };
    
    return {
        findAll: bottomLevelCategoryFinder
    }
});