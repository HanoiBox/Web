import angular from 'angular';

angular.module("public/app/navbar/template/navbar-li.html", []).run(["$templateCache", function($templateCache) {
  $templateCache.put("public/app/navbar/template/navbar-li.html",
    "<li ng-class=\"{divider: leaf.name == 'divider'}\">\n" +
    "    <a href=\"{{leaf.link}}\" ng-if=\"leaf.name !== 'divider'\">{{leaf.name}}</a>\n" +
    "</li>");
}]);