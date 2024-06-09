const mongoose=require('mongoose');
const signupschema=mongoose.Schema({
    name:{
        type:String,
    },
    email:{
        type:String,
    },
    password:{
        type:String,
        require:true,
    },
    age:{
        type:Number,
    },
    gender:{
        type:String,
    },
    profilepic:{
        type:String
    }
})
signup=mongoose.model('signup',signupschema);
module.exports=signup