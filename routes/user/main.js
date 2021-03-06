const cwd=process.cwd();
const express = require('express');
const router = express.Router();
const passport = require(cwd+'/config/passport');
const controller = require(cwd+'/controller/user/main');

router.get('/',passport.authenticate('jwt',{session:false}),controller.main);
module.exports = router;