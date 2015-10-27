var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var autoIncrement = require('mongoose-auto-increment');

var advertSchema = new Schema({
	_id : Number,
	information: String,
	categories: [{type: Number, ref: 'Category' }]
});

advertSchema.plugin(autoIncrement.plugin, 'Advert');

var categorySchema = new Schema({
	_id : Number,
	description : String
});

categorySchema.plugin(autoIncrement.plugin, 'Category');

module.exports = {
	advert : mongoose.model('Advert', advertSchema),
	category : mongoose.model('Category', categorySchema)
};