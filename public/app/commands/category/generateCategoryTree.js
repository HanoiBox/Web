import angular from 'angular';
import 'babel/polyfill';

export default angular.module('categoryTreeCommandModule', [])
.factory('GenerateCategoryTree', function() {
    
    this.createLeafCategory = (id, currentCategoryId, englishDescription, vietnameseDescription, subTree, subTreePromise, parentCategoryId) => {
        return { id: id, currentCategoryId: currentCategoryId, title: englishDescription, name: vietnameseDescription, link: `/category/id:${id}`, subTree, subTreePromise, parentCategoryId };
    }
    
    this.createSubTree = (allCategories, currentCategoryId, parentCategoryId, callback) => {
        
        let subCategories = allCategories.filter(cat => cat.parentCategoryId === parentCategoryId);
        if (subCategories === null || subCategories.length === 0)
        {
           return callback({ subTree: null, parentCategoryId }); 
        }
        
        let theSubCategories = subCategories.map(subCat => {
            let subTreePromise = new Promise((resolve, reject) => {
                this.createSubTree(allCategories, currentCategoryId, subCat._id, (subTree) => {
                    resolve(subTree);
                });
            }); 
            
            return this.createLeafCategory(
                    subCat._id,
                    currentCategoryId,
                    subCat.description,
                    subCat.vietDescription,
                    null,
                    subTreePromise,
                    parentCategoryId
            );
        });
        
        let temporaryTreeStructures = [];
        for (let i = 0, l = theSubCategories.length; i < l; i++)
        {            
            theSubCategories[i].subTreePromise.then((subTree) => {
                temporaryTreeStructures.push(this.processSubBranch(subTree, theSubCategories));
                if (temporaryTreeStructures.length === theSubCategories.length)
                {
                    return callback({ subTree: temporaryTreeStructures, parentCategoryId });
                }
            })
            .catch((rejectionReason) => {
                return callback({ subTree: null, parentCategoryId });
            }); 
        }
    }
    
    this.processSubBranch = (createSubTreeResult, subCategories) => {
         // I am expecting the subtree for the parentCategoryId
        // so get the parent
        let parentCategoryTreeStructure = subCategories.find(catTree => catTree.id === createSubTreeResult.parentCategoryId);
        // and append the subtree
        if (parentCategoryTreeStructure.subTree !== undefined && parentCategoryTreeStructure.subTree === null)
        {
            var temp = parentCategoryTreeStructure;
            temp.subTree = createSubTreeResult.subTree;
            delete temp.subTreePromise;
            return temp;
        }
        
        return null;
    }
    
    this.processBranch = (createSubTreeResult, topLevelCategoryTrees) => {
        let topLevelTreeStructure = topLevelCategoryTrees.find(catTree => catTree.id === createSubTreeResult.parentCategoryId);
        // this is a top level category
        var temp = topLevelTreeStructure;
        temp.tree = createSubTreeResult.subTree;
        delete temp.subTreePromise;
        return temp;
    }
    
    let generateCategoryTree = (categories, currentCategoryId, callback) => {
        
        let topLevelCategoryTrees = categories.filter(cat => cat.level === 0).map(topCat => {
            
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
        
        let temporaryTreeStructures = [];
        for (let i = 0, l = topLevelCategoryTrees.length; i < l; i++)
        {            
            topLevelCategoryTrees[i].subTreePromise.then((result) => {
                let branch = this.processBranch(result, topLevelCategoryTrees);
                temporaryTreeStructures.push(branch);
                if (temporaryTreeStructures.length === topLevelCategoryTrees.length)
                {
                    //console.info("All was well, result: ", temporaryTreeStructures);
                    return callback(temporaryTreeStructures); 
                }
            })
            .catch((rejectionReason) => {
                console.error(rejectionReason);
                return callback(temporaryTreeStructures); 
            }); 
        }
    }
    
    return {
        generate: generateCategoryTree
    }
});