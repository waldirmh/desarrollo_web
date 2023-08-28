// vamos a utilizar su esquema de mongoose ya no para coneccion
const mongoose = require("mongoose");
const bcrypt = require("bcrypt-nodejs"); //  para encriptar la contraseña y no mostrar en texto plano
const { Schema } = mongoose;

const userSchema = new Schema({
  email: String,
  password: String,
});

// para cifrar la contraseña
userSchema.methods.encryptPassword = (password) => {
  return bcrypt.hashSync(password, bcrypt.genSaltSync(10));
};

//para comparar las contraseñas
userSchema.methods.comparePassword = function (password) {
  return bcrypt.compareSync(password, this.password);
};
// aqui me crea coleciones de la base de datos
module.exports = mongoose.model("users", userSchema);
