// usamos el modulo passport

const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
// jalamos a user.js
const User = require("../models/user");

// recibe un usuario para guardarlo para que otras paginas no pidan
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// verifico el id para darselo a otro navegador para que el user se autentique
passport.deserializeUser(async (id, done) => {
  const user = await User.findById(id);
  done(null, user);
});

passport.use(
  "local-signup",
  new LocalStrategy(
    {
      usernameField: "email",
      passwordField: "password",
      passReqToCallback: true,
    }, // para que se registre el usuario
    async (req, email, password, done) => {
      //validamos al usuario
      const user = await User.findOne({ email: email });
      if (user) {
        return done(
          null,
          false,
          req.flash("signupMessage", "THE Email is already taken")
        );
      } else {
        const newUser = new User();
        newUser.email = email;
        newUser.password = newUser.encryptPassword(password); // aqui lo encripta
        await newUser.save(); // cuando termine de guardarlo continue con la sgte linea
        done(null, newUser); // termina el proceso y me da los datos del usuario autenticado
      }
    }
  )
);

passport.use(
  "local-signin",
  new LocalStrategy(
    {
      usernameField: "email",
      passwordField: "password",
      passReqToCallback: true,
    },
    async (req, email, password, done) => {
      const user = await User.findOne({ email: email });
      if (!user) {
        // si no existe el correo
        return done(null, false, req.flash("signinMessage", "No user found"));
      }
      if (!user.comparePassword(password)) {
        return done(
          null,
          false,
          req.flash("signinMessage", "Incorrect Password")
        );
      }
      done(null, user);
    }
  )
);
