var gulp = require("gulp"),
    rename = require("gulp-rename"),
    concat = require("gulp-concat"),
    uglify = require("gulp-uglify"),
    eslint = require("gulp-eslint"),
    minifyCSS = require("gulp-minify-css"),
    gulp_jspm = require('gulp-jspm')
    replace = require('gulp-jspm');
    
gulp.task("sysadmin", function() {
    gulp.src("sysadmin/main.js")
        .pipe(gulp_jspm({verbose: false, selfExecutingBundle: true}))
        .pipe(rename("build.js"))
        .pipe(gulp.dest("sysadmin/dist"));
});
    
gulp.task("css", function() {
    gulp.src(["jspm_packages/npm/bootstrap-css-only@3.3.6/css/bootstrap.css",
                    "jspm_packages/npm/angular-loading-bar@0.8.0/src/loading-bar.css"])
        .pipe(concat("sysadmin.css"))
        .pipe(minifyCSS())
        .pipe(rename({suffix: ".min"}))
        .pipe(gulp.dest("sysadmin/dist/styles"));
        
    return gulp.src(["jspm_packages/github/leon/angular-upload@1.0.12/src/directives/btnUpload.min.css",
                    "jspm_packages/github/JustGoscha/allmighty-autocomplete@master/style/autocomplete.css", 
                    "jspm_packages/npm/bootstrap-css-only@3.3.6/css/bootstrap.css", 
                    "public/app/navbar/navbar.css",
                    "public/app/routes/listing/listing.css"])
        .pipe(concat("public.css"))
        .pipe(minifyCSS())
        .pipe(rename({suffix: ".min"}))
        .pipe(gulp.dest("public/dist/styles"));
});

gulp.task("fonts", function() {
    return gulp.src(["jspm_packages/npm/bootstrap-css-only@3.3.6/fonts/*"])
                .pipe(gulp.dest("public/dist/fonts"));
});

// gulp css-build