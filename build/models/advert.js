'use strict';

var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var autoIncrement = require('mongoose-auto-increment');

var advertSchema = new Schema({
	information: String,
	categories: [{ type: Number, ref: 'Category' }],
	created: { type: Date, default: Date.now },
	image1: String,
	image2: String
});

advertSchema.plugin(autoIncrement.plugin, 'Advert');

var categorySchema = new Schema({
	description: String,
	vietDescription: String,
	level: Number,
	parentCategoryId: Number,
	parentCategory: {},
	introduction: String
});

categorySchema.plugin(autoIncrement.plugin, 'Category');

module.exports = {
	advert: mongoose.model('Advert', advertSchema),
	category: mongoose.model('Category', categorySchema)
};