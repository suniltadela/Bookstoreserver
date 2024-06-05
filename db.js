const { default: mongoose } = require("mongoose");
const mangoose=require("mongoose");
require('dotenv').config();
mongoose.connect(process.env.Mongo_url).then(()=>{
    console.log(`connected to database`);

})
.catch((err)=>{
    console.log("error connecting database"+err)
})