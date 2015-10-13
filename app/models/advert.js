var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var advertSchema = new Schema({
	_id : Number,
	information: String,
	categories: [{type: Number, ref: 'Category' }]
});

var categorySchema = new Schema({
	_id : Number,
	description : String
});

module.exports = {
	advert : mongoose.model('Advert', advertSchema),
	category : mongoose.model('Category', categorySchema)
};