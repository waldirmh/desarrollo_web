// aqui van los archivo del servidor
const express = require("express");
const engine = require("ejs-mate");
const path = require("path");
const morgan = require("morgan");
const passport = require("passport");
const sesion = require("express-session");
const flash = require("connect-flash");

/* import { dirname, join } from "path"; // para no estar utilizando los rutas raices
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url)); //para decirle que es algo interno de nuestra app */

// Initializations
const app = express();
/* const __dirname = dirname(fileURLToPath(import.meta.url)); //para decirle que es algo interno de nuestra app */

// para inicializar la database.js
// require("./database");
// require("./passport/local-auth");

//settings

app.set("views", path.join(__dirname, "views")); // me llama la ruta views
console.log(path.join(__dirname, "views"))
app.use(express.static(path.join(__dirname, "public"))); //  public folder

app.engine("ejs", engine); // es el motor de plantillas
app.set("view engine", "ejs"); // sirve para validar los views del fronted
app.set("port", process.env.PORT || 3000);

// middlewares : se ejecuta antes de ser ejecutados las rutas
// app.use(express.static('public'));

app.use(morgan("dev"));
app.use(express.urlencoded({ extended: false })); // me permite capturar datos del cliente
// inicializamos la sesion
app.use(
  sesion({
    secret: "myscretsession",
    resave: false,
    saveUninitialized: false,
  })
);

app.use(flash()); // declaramos el paquete flash para el logeo - error 
app.use(passport.initialize());
app.use(passport.session());

app.use((req, res, next) => {
  app.locals.signupMessage = req.flash("signupMessage");
  app.locals.signinMessage = req.flash("signinMessage");
  app.locals.user = req.user;
  next();
});

// Routes
app.use("/", require("./routes/index"));

// starting the server
app.listen(app.get("port"), () => {
  console.log("server on port", app.get("port"));
});
