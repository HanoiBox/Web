import angular from 'angular';

export default angular.module('categoryTreeCommandModule', [])
.factory('GenerateCategoryTree', function() {
    
    this.createLeafCategory = (id, currentCategoryId, englishDescription, vietnameseDescription, subtree) => {
        return { id: id, currentCategoryId: currentCategoryId, title: englishDescription, name: vietnameseDescription, link: `/category/id:${id}`, subtree: subtree };
    };
    
    let recursionCount = 0;
    
    this.createSubTree = (allCategories, currentCategoryId, parentCategoryId, callback) => {
        recursionCount++;
        console.log("recursionCount: ", recursionCount);
        let subCategories = allCategories.filter(cat => cat.parentCategoryId === parentCategoryId);
        if (subCategories === null || subCategories.length === 0)
        {
           return callback(null); 
        }
        
        let theSubCategories = subCategories.map(subCat => {
            let subTreePromise = new Promise((resolve, reject) => {
                this.createSubTree(allCategories, currentCategoryId, subCat._id, (subTree) => {
                    resolve(subTree);
                });
            }); 
            
            return {
                    name: subCat.vietDescription,
                    title: subCat.description,
                    link: `/category/id:${subCat._id}`,
                    id: subCat._id,
                    tree: null,
                    subTreePromise
                };
        });
        
        let temporaryTreeStructures = [], temporaryTreeStructure = null;
        for(let i = 0, l = theSubCategories.length; i < l; i++)
        {
            let topCat = theSubCategories[i];
            topCat.subTreePromise.then((subTree) => {
                console.log("does this subcat exist?:", subTree);
                temporaryTreeStructure = theSubCategories[i];
                delete temporaryTreeStructure.subTreePromise;
                if (subTree !== null)
                {
                    temporaryTreeStructure.tree = subTree;
                    temporaryTreeStructures.push(temporaryTreeStructure); 
                } else {
                    temporaryTreeStructures.push(temporaryTreeStructure); 
                }
                
                console.log("What is the subcat now?:", topCat.tree);
                if (finishedGatheringSubtrees(i, l))
                {
                    return callback(temporaryTreeStructures); 
                }
            }).catch((rejectionReason) => {
                console.error(rejectionReason);
                if (finishedGatheringSubtrees(i, l))
                {
                    return callback(temporaryTreeStructures); 
                }
            }); 
        }
    };
    
    let finishedGatheringSubtrees = (i, l) => {
        let iterator = i + 1;
        return iterator === l;
    }
    
    let generateCategoryTree = (categories, currentCategoryId, callback) => {
        
        let categoryTreeStructure = categories.filter(cat => cat.level === 0).map(topCat => {
            let subTreePromise = new Promise((resolve, reject) => {
                
               this.createSubTree(categories, currentCategoryId, topCat._id, (subTree) => {
                   resolve(subTree);
               });
            }); 
            
            return {
                    name: topCat.vietDescription,
                    title: topCat.description,
                    link: `/category/id:${topCat._id}`,
                    id: topCat._id,
                    tree: null,
                    subTreePromise
                };
        });
        
        console.log("continuing.. length: ", categoryTreeStructure.length);
        let temporaryTreeStructures = [], temporaryTreeStructure = null;
        for (let i = 0, l = categoryTreeStructure.length; i < l; i++)
        {
            temporaryTreeStructure = categoryTreeStructure[i];
            
            
            let topCat = categoryTreeStructure[i];
            topCat.subTreePromise.then((subTree) => {
                console.log("does this exist?:", subTree);
                delete temporaryTreeStructure.subTreePromise;
                if (subTree !== null && subTree !== undefined)
                {
                    temporaryTreeStructure.tree = subTree;
                    temporaryTreeStructures.push(temporaryTreeStructure);
                } else {
                    temporaryTreeStructures.push(temporaryTreeStructure);
                }
                console.log("What is it now?:", temporaryTreeStructure.tree);
                if (finishedGatheringSubtrees(i, l))
                {
                    return callback(temporaryTreeStructures); 
                }
            })
            .catch((rejectionReason) => {
                console.error(rejectionReason);
                if (finishedGatheringSubtrees(i, l))
                {
                    return callback(temporaryTreeStructures); 
                }
            }); 
        }
    };
    
    return {
        generate: generateCategoryTree
    }
});