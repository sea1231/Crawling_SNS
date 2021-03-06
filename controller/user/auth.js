const cwd = process.cwd();
const jwt = require('jsonwebtoken');
const db = require(cwd+'/config/db');
const bkfd2Password = require("pbkdf2-password");
const hasher = bkfd2Password();
const config = require(cwd+'/config/secret');
const nodemailer = require(cwd + '/config/email');
const crypto=require('crypto');

const email_template=require(cwd+'/config/email_template');

exports.signin=(req,res)=>{
  //TODO : 패스워드 중복검사
  //이메일 패스워드 이름을 받는다
  const {email,password,password_verify,name}= req.body;
  if(password!==password_verify) return res.render('main',{message:"패스워드 중복"});
  //중복된 이메일 검사
  db.query('select count(*) as checkuser from user where User_Email=?',[email],(err,result)=>{
    if(err) console.log(err);
    // 결과값이 있다면
    if(result[0].checkuser>0){
      //TODO : 로그인 실패시 이동하는 화면(메인화면)에 어떤 상태인지 표기
      res.render('main',{message:"중복된 아이디"})
    }else{
      hasher({password:password},(err,pass,salt,hash)=>{
        crypto.randomBytes(64,(err,buf)=>{
          if(err) console.log(err);
          const user = {
            authID:buf.toString('hex'),
            User_Email:email,
            User_Name: name,
            User_Hash: hash,
            User_Salt: salt
          };
          console.log(user);
          db.query('insert into user set ?',[user],(err,results)=>{
            if(err) console.log(err);
            //유저 이메일 인증
            let email_token = jwt.sign({User_Email: email},config.secret,{expiresIn:'5h'});
            res.render('main',{message: "회원가입을 완료하시려면 이메일 등록을 해주세요"});
            nodemailer.sendMail(email_template.email_verify(email,email_token));
          })
        })
      })
    }
  })
};

exports.login=(req,res)=>{
  console.log(req.body);
  const {email,password} = req.body;
  db.query('select * from user where User_Email=?',[email],(err,result)=>{
    if(err) console.log(err);
    const user = result[0];
    console.log(user);
    if(!user){
      return res.render('main',{message:"아이디나 비밀번호가 틀렸습니다!!"});
    }else if(user.User_Email_Verify===1){
      if(user.User_Blacklist===1){
        return res.render('main',{message:"밴 당한 사용자입니다."});
      }
      hasher({password:password,salt:user.User_Salt},(err,pass,salt,hash)=>{
        console.log(user.User_Salt);
        console.log(hash);
        console.log(user.User_Hash);
        if(hash === user.User_Hash){
          //로그인 완료
          const token = jwt.sign({authID:user.authID},config.secret,{expiresIn:'1h'});
          res.cookie('jwt',token);
          //TODO:오버뷰 화면으로 이동
          if(user.User_isAdmin===1){
            res.render('admin/overview');
          }else{
            res.redirect('/main')
          }
        }else{
          //비밀번호 틀림
          //TODO : 로그인 창으로 이동
          res.render('main',{message:"아이디나 비밀번호가 틀렸습니다!"})
        }
      })
    }else{
      res.render('main',{message:"이메일 인증을 해주세요"});
    }
  });
};

exports.email_verify=(req,res)=>{
  //TODO : 토큰을 받아서 유효기간 검사하고 유효하다면 email찾고 email있으면 1로 바꾸고 true
  //TODO : GET으로 토큰받기
  const token = req.query.token;
  jwt.verify(token,config.secret,(err,decoded)=>{
    if(err){
      console.log(err);
      res.render('main',{message:"잘못되거나 만료된 토큰입니다"});
    } else {
      db.query('select * from user where User_Email=?',[decoded.User_Email],(err,result)=>{
        if(err) console.log(err);
        if(result[0]){
          db.query('update user set User_Email_Verify=1 where User_Email=?',[decoded.User_Email],(err,results)=>{
            if(err) console.log(err);
            if(results.changedRows===0){
              res.render('main',{message:"이미 인증된 이메일 입니다."});
            }else if(results.changedRows===1){
              res.render('main',{message:"인증되었습니다. 로그인해주세요"});
            }
          })
        }else{
          res.render('main',{message:"잘못된 토큰입니다."})
        }
      })
    }
  });
};

exports.find_pw=(req,res)=>{
  const email = req.body.userMail;
  db.query('select count(*) as member_exist from user where User_Email=?',[email],(err,result)=>{
    if(err) console.log(err);
    if(result[0].member_exist ===0){
      res.render('main',{message:"없는 회원입니다"});
    }else{
      const token = jwt.sign({User_Email:email},config.secret,{expiresIn:'120m'});
      console.log(token);
      res.render('main',{message:'비밀번호 재설정 링크를 보냈습니다. 메일함을 확인해보세요'});
      nodemailer.sendMail(email_template.find_pw(email,token));
    }
  })
};

exports.new_pw_page=(req,res)=> {
  //TODO : 토큰을 get으로 받아서 렌더링 할때 넣어주기 없으면 오류
  let token = null;
  if (req.cookies.jwt) {
    token = req.cookies.jwt;
  } else {
    token = req.query.token;
  }
  jwt.verify(token, config.secret, (err) => {
    if (err) {
      console.log(err);
      return res.render('main', {message: "유효하지 않은 토큰입니다."})
    } else {
      res.render('new_pw', {token: token});
    }
  });
};


//새비밀번호 찾기 & 비밀번호 변경
exports.new_pw=(req,res)=>{
  console.log(req.body);
  const {new_pw,token} =req.body;
  jwt.verify(token,config.secret,(err,decoded)=>{
    if(err) res.render('main',{message:"토큰이 만료되었거나 유효한 토큰이 아닙니다. 다시 시도해 주십시오"});
    else{
      hasher({password:new_pw},(err,pass,salt,hash)=>{
        console.log(pass);
        console.log(hash);
        console.log(salt);
        if(err) console.log(err);
        if(decoded.authID){
          console.log("dd");
          db.query('update user set User_Hash=?,User_Salt=? where authID=?',[hash,salt,decoded.authID],(err,results)=>{
            if(err) console.log(err);
            if(results.changedRows===1) {
              res.render('main', {message: "성공적으로 변경되었습니다. 로그인해주세요"});
            }else{
              res.render('main', {message: "비밀번호가 변경되지 않았습니다."});
            }
          })
        }else if(decoded.User_Email){
          console.log("ff");
          db.query('update user set User_Hash=?,User_Salt=? where User_Email=?',[hash,salt,decoded.User_Email],(err,results)=>{
            if(err) console.log(err);
            if(results.changedRows===1) {
              res.render('main', {message: "성공적으로 변경되었습니다. 로그인해주세요"});
            }else{
              res.render('main', {message: "비밀번호가 변경되지 않았습니다."});
            }
          })
        }

      })
    }
  })
};

exports.settings_view=(req,res)=>{
  db.query('select * from user where User_ID=?',[req.user.User_ID],(err,results)=>{
    if(err) console.log(err);
    const setting = results;
    console.log(setting);
    res.render('user/settings/settings',{setting:setting});
  });
};
exports.setting_event_view=(req,res)=>{
  const {View_Eleven,View_Tmon}=req.body;
  db.query('update user set View_Eleven=? , View_Tmon=? where User_ID=?',[View_Eleven,View_Tmon,req.user.User_ID],(err)=>{
    if(err) console.log(err);
    res.redirect('/settings');
  });
};
exports.setting_hotdeal_view=(req,res)=>{
  const {View_Ppomppu,View_Coolenjoy}=req.body;
  db.query('update user set View_Ppomppu=? , View_Coolenjoy=? where User_ID=?',[View_Ppomppu,View_Coolenjoy,req.user.User_ID],(err)=>{
    if(err) console.log(err);
    res.redirect('/settings');
  });
};

exports.setting_alarm=(req,res)=>{
  const Alarm_Eleven=req.body.Alarm_Eleven;
  const Alarm_Tmon=req.body.Alarm_Tmon;
  const Alarm_Ppomppu=req.body.Alarm_Ppomppu;
  const Alarm_Ppomppu_Recommend=req.body.Alarm_Ppomppu_Recommend;
  const Alarm_Coolenjoy=req.body.Alarm_Coolenjoy;
  const Alarm_Coolenjoy_Recommend=req.body.Alarm_Coolenjoy_Recommend;
  db.query('update user set Alarm_Eleven=? , Alarm_Tmon=?,Alarm_Ppomppu=?,Alarm_Ppomppu_Recommend=?,' +
    'Alarm_Coolenjoy=?,Alarm_Coolenjoy_Recommend=? where User_ID=?',
    [Alarm_Eleven,Alarm_Tmon,Alarm_Ppomppu,Alarm_Ppomppu_Recommend,Alarm_Coolenjoy,Alarm_Coolenjoy_Recommend,req.user.User_ID],(err)=>{
    if(err) console.log(err);
    res.redirect('/settings');
  });
};