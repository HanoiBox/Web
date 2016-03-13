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
        template: navbarTemplate,
        compile: function(el, attrs) {
            var element = el[0],
                liElements = element.querySelectorAll(".navbar-nav li");
            for (var index = 0, length = liElements.length; index < length; index++) {
                var li = liElements[index], 
                    link = li.querySelector("a");
                if (link.textContent === attrs.currentTab) {
                    if (li.classList) {
                        li.classList.add("active");
                    }
                    else {
                        li.className += ' ' + "active";
                    }
                }
            }
        }
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