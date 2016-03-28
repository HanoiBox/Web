import angular from 'angular';
import navbarTemplate from 'public/app/navbar/navbar.html!text';
import navbarUlTemplate from 'public/app/navbar/template/navbar-ul.html!text';
import navbarLiTemplate from 'public/app/navbar/template/navbar-li.html!text';

export default angular.module('navbarAppModule', [
    
]).directive("bootstrapNavbar", function() {
    return {
        restrict: "E",         // Restrict to element
        replace: true,         // replace element with markup
        transclude: true,      // What does this transclude option do, exactly? 
        // transclude makes the contents of a directive have access to the scope outside of the directive rather than inside.
        template: navbarTemplate
    }
}).directive('tree', function () {
    return {
        restrict: 'E',
        replace: true,
        scope: {
            tree: '='
        },
        template: navbarUlTemplate
    };
}).directive('leaf', ['$compile', function ($compile) {
    return {
        restrict: 'E',
        replace: true,
        scope: {
            leaf: '='
        },
        template: navbarLiTemplate,
        link: function (scope, element, attrs) {
            if (angular.isArray(scope.leaf.subtree)) {
                element.append('<tree tree=\"leaf.subtree\"></tree>');

                // find the parent of the element
                var parent = element.parent();
                var classFound = false;

                // check if in the hierarchy of the element exists a dropdown with class navbar-right
                while(parent.length > 0 && !classFound) {
                    // check if the dropdown has been push to right
                    if(parent.hasClass('navbar-right')) {
                        classFound = true;
                    }
                    parent = parent.parent();
                }

                // add a different class according to the position of the dropdown
                if(classFound) {
                    element.addClass('dropdown-submenu-right');
                } else {
                    element.addClass('dropdown-submenu');
                }

                $compile(element.contents())(scope);
            }
        }
    };
}]);

angular.module("public/app/navbar/template/navbar-ul.html", []).run(["$templateCache", function($templateCache) {
  $templateCache.put("public/app/navbar/template/navbar-ul.html",
    "<ul class='dropdown-menu'>\n" +
    "    <leaf ng-repeat='leaf in tree' leaf='leaf'></leaf>\n" +
    "</ul>");
}]);

angular.module("public/app/navbar/template/navbar-li.html", []).run(["$templateCache", function($templateCache) {
  $templateCache.put("public/app/navbar/template/navbar-li.html",
    "<li ng-class=\"{divider: leaf.name == 'divider'}\" ng-class=\"{active: currentCategoryId === topCat.id}\" >\n" +
    "    <a ng-click=\"{{leaf.link}}\" ng-if=\"leaf.name !== 'divider'\">{{leaf.name}}</a>\n" +
    "</li>");
}]);