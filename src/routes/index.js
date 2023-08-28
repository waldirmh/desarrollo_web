const express = require("express");
const router = express.Router(); /*  */
const passport = require("passport");
const db = require("../firestore");
const fs = require("fs");
const path = require("path");
const pdfkit = require("pdfkit");
const moment = require("moment");
const LocalStorage = require("node-localstorage").LocalStorage;
const localStorage = new LocalStorage("./scratch");
const puppeteer = require("puppeteer");
const open = require("open");
const ExcelJS = require("exceljs");

// RENDERS

router.get("/", (req, res, next) => {
  res.redirect("/signin");
});
router.get("/signup", (req, res, next) => {
  res.render("signup"); // el usuario ingresa y el servidor responde con la ruta de signup
});

/* router.post(
  "/signup",
  passport.authenticate("local-signup", {
    successRedirect: "/profile", // si es correcto
    failureRedirect: "/signup", //si falla
    passReqToCallback: true,
  })
); */

router.get("/signin", isNotAuthenticated, (req, res, next) => {
  res.render("signin", {
    warning: "",
    error: "",
  });
});
router.post("/signin", (req, res) => {
  const { username, password } = req.body;
  try {
    db.collection("accesos")
      .where("username", "==", username)
      .where("password", "==", password)
      .get()
      .then((doc) => {
        if (doc.empty) {
          return res.render("signin", {
            warning: "El usuario o la contraseña no coinciden",
            error: "",
          });
        } else {
          localStorage.setItem("username", username);
          localStorage.setItem("password", password);
          return res.redirect("/inicio");
        }
      })
      .catch((err) => {
        console.error("Error obteniendo documento:", err);
        return res.render("signin", {
          error: "Error al obtener el documento",
          warning: "",
        });
      });
  } catch (error) {
    return res.render("signin", {
      error: "Error de servidor",
      warning: "",
    });
  }
});

router.get("/logout", function (req, res, next) {
  localStorage.removeItem("username");
  localStorage.removeItem("password");
  return res.redirect("/");
});

// router.use((req, res, next) => {
//   isAuthenticated(req, res, next);
//   next();
// });

router.get("/inicio", isAuthenticated, (req, res, next) => {
  res.render("home");
});

router.get("/ventas", isAuthenticated, async (req, res, next) => {
  await getCorrelative()
    .then((resp) => {
      const dateCurrent = new Date();
      const day = dateCurrent.getDate();
      const month = dateCurrent.getMonth() + 1;
      const year = dateCurrent.getFullYear();

      return res.render(
        "ventas",
        getDataOrderView({
          correlative: "N° " + resp,
          date:
            year +
            "-" +
            String(month).padStart(2, "0") +
            "-" +
            String(day).padStart(2, "0") /*   date  */,
        })
      );
    })
    .catch((error) => {
      console.error(error);
      return res.render(
        "ventas",
        getDataOrderView({
          error: "No se pudo obtener el correlativo",
        })
      );
    });
});

router.get("/reportes", isAuthenticated, (req, res, next) => {
  res.render("reportes", getDataReportsView());
});

router.get("/profile", (req, res, next) => {
  res.render("profile");
});

router.get("/dashboard", isAuthenticated, (req, res, next) => {
  res.send("hello -dashboard");
});

// FUNCTIONS

function isAuthenticated(req, res, next) {
  const username = localStorage.getItem("username");
  const password = localStorage.getItem("password");
  if (username && password) {
    return next();
  }
  return res.redirect("/signin");
}

function isNotAuthenticated(req, res, next) {
  const username = localStorage.getItem("username");
  const password = localStorage.getItem("password");
  if (username && password) {
    return res.redirect("/inicio");
  }
  return next();
}

async function getCorrelative() {
  const response = await db
    .collection("correlativos")
    .doc("amjyEloSIuhpdn6JLOMj")
    .get();
  const { numero_boleta } = response.data();
  return String(numero_boleta).padStart(6, "0");
}

function getDataOrderView(data) {
  return {
    success: "",
    error: "",
    correlative: "",
    saved: false,
    phone: "",
    address: "",
    validate: "",
    date: "",
    sir: "",
    details: [],
    total: 0,
    ...data,
  };
}

function getDataReportsView(data) {
  return {
    success: "",
    error: "",
    dateStart: "",
    dateEnd: "",
    textSearch: "",
    dataFound: [],
    warning: "",
    ...data,
  };
}

async function updateCorrelative() {
  const correlative = await getCorrelative();
  return db
    .collection("correlativos")
    .doc("amjyEloSIuhpdn6JLOMj")
    .update({
      numero_boleta: Number(correlative) + 1,
    });
}

function getOrdersByDate(dateStart, dateEnd) {
  return db
    .collection("cabecera-orden")
    .where("date", ">=", dateStart)
    .where("date", "<=", dateEnd)
    .get();
}

async function getOrderHeaderAndDetails(correlative) {
  let header = {};
  let details = [];

  const detailsResponse = await db
    .collection("detalle-orden")
    .where("correlative", "==", correlative)
    .get();

  const headerResponse = await db
    .collection("cabecera-orden")
    .where("correlative", "==", correlative)
    .get();

  if (!headerResponse.empty) {
    header = headerResponse.docs[0].data();
    header.id = headerResponse.docs[0].id;

    if (!detailsResponse.empty) {
      const detailsArray = detailsResponse.docs;
      details = detailsArray.map((item) => ({ ...item.data(), id: item.id }));
    }
  }

  return [header, details];
}

// API

router.post("/deleteOrderDetail", (req, res, next) => {
  const { correlative, id } = req.query;

  db.collection("detalle-orden")
    .doc(id)
    .delete()
    .then(() => getOrderHeaderAndDetails(correlative))
    .then((resp) => {
      const [header, details] = resp;
      const total = details.reduce(
        (prev, curr) => Number(curr.subTotal) + prev,
        0
      );

      if (!header) {
        return res.render(
          "ventas",
          getDataOrderView({
            error: "No se encontró la cabecera",
            saved: true,
          })
        );
      } else {
        if (!details) {
          return res.render(
            "ventas",
            getDataOrderView({
              error: "No se encontró la cabecera",
              saved: true,
            })
          );
        } else {
          return db
            .collection("cabecera-orden")
            .doc(header.id)
            .update({
              total: Number(total).toFixed(2),
            })
            .then(() => {
              header.total = Number(total).toFixed(2);
              header.details = details;
              return header;
            });
        }
      }
    })
    .then((header) => {
      const {
        phone,
        date,
        address,
        sir,
        validate,
        correlative,
        total,
        details,
      } = header;
      return res.render(
        "ventas",
        getDataOrderView({
          success: `Se eliminó correctamente`,
          saved: true,
          details,
          correlative,
          phone,
          address,
          validate,
          date,
          sir,
          total,
        })
      );
    })
    .catch((error) => {
      console.error(error);
      return res.render(
        "ventas",
        getDataOrderView({
          error: "No se pudo eliminar el detalle",
          saved: true,
        })
      );
    });
});

router.post("/sendDetailsOrder", (req, res, next) => {
  const { quantity, price, description } = req.body;
  const { correlative } = req.query;
  /* console.log("impresion"+correlative) */
  const subTotal = Number(quantity) * Number(String(price).replace(",", "."));
  let header = {};
  let details = [];
  let headerId = "";
  // req.params => /login/:username/:password

  db.collection("detalle-orden")
    .add({
      correlative,
      quantity,
      price: Number(String(price).replace(",", ".")).toFixed(2),
      description: String(description).toUpperCase(),
      subTotal: Number(subTotal).toFixed(2),
    })
    .then(() => {
      return db
        .collection("cabecera-orden")
        .where("correlative", "==", correlative)
        .get();
    })
    .then((doc) => {
      if (doc.empty) {
        return res.render(
          "ventas",
          getDataOrderView({
            error: "No se encontró la cabecera",
            saved: true,
          })
        );
      } else {
        header = doc.docs[0].data();
        headerId = doc.docs[0].id;
        return db
          .collection("detalle-orden")
          .where("correlative", "==", correlative)
          .get();
      }
    })
    .then((docDetails) => {
      const detailsArray = docDetails.docs;
      details = detailsArray.map((item) => ({ ...item.data(), id: item.id }));
      const total = details.reduce(
        (prev, curr) => Number(curr.subTotal) + prev,
        0
      );

      if (docDetails.empty) {
        return res.render(
          "ventas",
          getDataOrderView({
            error: "No se encontró la cabecera",
            saved: true,
          })
        );
      } else {
        return db
          .collection("cabecera-orden")
          .doc(headerId)
          .update({
            total: Number(total).toFixed(2),
          })
          .then(() => Number(total).toFixed(2));
      }
    })
    .then((total) => {
      const { phone, date, address, sir, validate, correlative } = header;
      return res.render(
        "ventas",
        getDataOrderView({
          success: `Se agrego ${description} correctamente`,
          saved: true,
          details,
          correlative,
          phone,
          address,
          validate,
          date,
          sir,
          total,
        })
      );
    })
    .catch((error) => {
      console.error(error);
      return res.render(
        "ventas",
        getDataOrderView({
          error: "No se pudo guardar el detalle",
          saved: true,
        })
      );
    });
});

router.post("/sendHeaderOrder", (req, res, next) => {
  const { phone, address, validate, date, sir } = req.body;

  getCorrelative()
    .then((correlative) => {
      db.collection("cabecera-orden")
        .add({
          phone,
          address: String(address).toUpperCase(),
          validate: String(validate).toUpperCase(),
          date,
          sir: String(sir).toUpperCase(),
          correlative: "N° " + correlative,
          total: 0,
        })
        .then((ref) => {
          /* console.log("direccion"+address) //imprimimos la direccion */
          return res.render(
            "ventas",
            getDataOrderView({
              success: "Se guardo correctamente la cabecera",
              correlative: "N° " + correlative,
              saved: true,
              phone,
              address,
              validate,
              date,
              sir,
            })
          );
        })
        .catch((error) => {
          console.error(error);
          return res.render(
            "ventas",
            getDataOrderView({
              error: "No se pudo guardar la cabecera",
            })
          );
        });
    })
    .catch((error) => {
      console.error(error);
      return res.render(
        "ventas",
        getDataOrderView({
          error: "No se pudo obtener el correlativo",
        })
      );
    });
});

router.get("/finishOrder", (req, res) => {
  updateCorrelative()
    .then(() => res.redirect("/inicio"))
    .catch((error) => {
      console.error(error);
      return res.render(
        "ventas",
        getDataOrderView({
          error: "Ocurrio un error al actualizar el correlativo",
        })
      );
    });
});

router.post("/cancelOrder", (req, res) => {
  const { correlative } = req.query;

  db.collection("detalle-orden")
    .where("correlative", "==", correlative)
    .get()
    .then((doc) => {
      if (doc.empty) return;
      else {
        const promises = doc.docs.map((item) => item.ref.delete());
        return Promise.all(promises);
      }
    })
    .then(() => {
      return db
        .collection("cabecera-orden")
        .where("correlative", "==", correlative)
        .get();
    })
    .then((doc) => {
      if (doc.empty) return;
      else return db.collection("cabecera-orden").doc(doc.docs[0].id).delete();
    })
    .then(() => res.redirect("/inicio"))
    .catch((error) => {
      return res.render(
        "ventas",
        getDataOrderView({
          error: "Error al cancelar orden",
        })
      );
    });
});

router.post("/removeOrder/:correlative", (req, res) => {
  const { correlative } = req.params;
  const { dateStart, dateEnd, textSearch } = req.query;

  db.collection("detalle-orden")
    .where("correlative", "==", correlative)
    .get()
    .then((doc) => {
      console.log(doc.docs);
      if (doc.empty) return;
      else {
        const promises = doc.docs.map((item) => item.ref.delete());
        return Promise.all(promises);
      }
    })
    .then(() => {
      return db
        .collection("cabecera-orden")
        .where("correlative", "==", correlative)
        .get();
    })
    .then((doc) => {
      if (doc.empty) return;
      else return db.collection("cabecera-orden").doc(doc.docs[0].id).delete();
    })
    .then(() => {
      if (textSearch) return db.collection("cabecera-orden").get();
      return getOrdersByDate(dateStart, dateEnd);
    })
    .then((doc) => {
      if (doc.empty) {
        return res.render(
          "reportes",
          getDataReportsView({
            success: "Se eliminó correctamente",
            dateStart,
            dateEnd,
          })
        );
      } else {
        let dataFound = [];

        if (textSearch)
          dataFound = doc.docs
            .map((item) => ({
              ...item.data(),
              id: item.id,
              date: moment(item.data().date, "yyyy-MM-DD").format("DD/MM/yyyy"),
            }))
            .filter(
              (x) =>
                String(x.sir)
                  .toLowerCase()
                  .includes(String(textSearch).toLowerCase().trim()) ||
                String(x.correlative)
                  .toLowerCase()
                  .includes(String(textSearch).toLowerCase().trim())
            );
        else
          dataFound = doc.docs.map((item) => ({
            ...item.data(),
            id: item.id,
            date: moment(item.data().date, "yyyy-MM-DD").format("DD/MM/yyyy"),
          }));

        return res.render(
          "reportes",
          getDataReportsView({
            success: "Se eliminó correctamente",
            dataFound,
            dateStart,
            dateEnd,
          })
        );
      }
    })
    .catch((error) => {
      console.error(error);
      return res.render(
        "ventas",
        getDataOrderView({
          error: "Error al cancelar orden",
        })
      );
    });
});

router.post("/filterOrderByDate", (req, res) => {
  const { dateStart, dateEnd } = req.body;

  db.collection("cabecera-orden")
    .where("date", ">=", dateStart)
    .where("date", "<=", dateEnd)
    .get()
    .then((doc) => {
      if (doc.empty) {
        return res.render(
          "reportes",
          getDataReportsView({
            warning: "No existen resultados de búsqueda",
            dateStart,
            dateEnd,
          })
        );
      } else {
        const dataFound = doc.docs.map((item) => ({
          ...item.data(),
          id: item.id,
          date: moment(item.data().date, "yyyy-MM-DD").format("DD/MM/yyyy"),
        }));
        return res.render(
          "reportes",
          getDataReportsView({
            success: "Búsqueda existosa",
            dataFound,
            dateStart,
            dateEnd,
          })
        );
      }
    })
    .catch((error) => {
      console.error(error);
      return res.render(
        "reportes",
        getDataReportsView({
          error: "Error al traer los reportes",
          dateStart,
          dateEnd,
        })
      );
    });
});

/*     SEARCH    */
router.post("/filterSearch", (req, res) => {
  const { textSearch } = req.body;
  const { dateStart, dateEnd } = req.query;

  db.collection("cabecera-orden")
    .get()
    .then((doc) => {
      if (doc.empty) {
        return res.render(
          "reportes",
          getDataReportsView({
            warning: "No existe registros",
            dateStart,
            dateEnd,
            textSearch,
          })
        );
      } else {
        const dataFound = doc.docs
          .map((item) => ({
            ...item.data(),
            id: item.id,
            date: moment(item.data().date, "yyyy-MM-DD").format("DD/MM/yyyy"),
          }))
          .filter(
            (x) =>
              String(x.sir)
                .toLowerCase()
                .includes(String(textSearch).toLowerCase().trim()) ||
              String(x.correlative)
                .toLowerCase()
                .includes(String(textSearch).toLowerCase().trim())
          );

        return res.render(
          "reportes",
          getDataReportsView({
            success: "Búsqueda existosa",
            dataFound,
            dateStart,
            dateEnd,
            textSearch,
          })
        );
      }
    })
    .catch((error) => {
      console.error(error);
      return res.render(
        "reportes",
        getDataReportsView({
          error: "Error al traer los reportes",
          dateStart,
          dateEnd,
        })
      );
    });
});

/*   START PDF */

router.post("/generate-pdf", (req, res) => {
  res.send('holaaaaaaaaaaaaa');

  const { correlative, dateStart, dateEnd, textSearch } = req.query;
  const fileName = `${Date.now()}.pdf`;
  const pdf = new pdfkit({
    size: "A4",
  });
  const fileImg = path.join(__dirname, "../public/img/background-ticket.png");
  const logoImg = path.join(__dirname, "../public/img/LOGOPRO.png");
  const filePdf = path.join(__dirname, "../public/pdfs/" + fileName);

  pdf
    .image(fileImg, 0, 0, {
      // fit: [pdf.page.height, pdf.page.width]
    })
    .text("Stretch", pdf.page.height, pdf.page.width);

  // LOGO
  pdf.image(logoImg, 55, 58, { width: 65, height: 39 });

  // TEXTO PROFORMA
  pdf
    .fontSize(25)
    .font("Times-Roman")
    .fillColor("black")
    .text("PROFORMA", 123, 110, {
      align: "center",
      baseline: "middle",
      width: pdf.page.width,
      height: pdf.page.height,
    });

  // TEXTO RUC
  pdf
    .fontSize(18)
    .font("Times-Roman")
    .fillColor("black")
    .text("RUC: 10707965075", 123, 80, {
      align: "center",
      baseline: "middle",
      width: pdf.page.width,
      height: pdf.page.height,
    });

  // MULTISERVICIOS
  pdf
    .fontSize(16)
    .font("Times-Roman")
    .fillColor("black")
    .text("Multicervicios Automotriz", 120, 70, {
      /*  align: "center", */
      baseline: "middle",
      width: pdf.page.width,
      height: pdf.page.height,
    });

  pdf
    .fontSize(16)
    .font("Times-Roman")
    .fillColor("black")
    .text("''Cars Center''", 150, 90, {
      /*  align: "center", */
      baseline: "middle",
      width: pdf.page.width,
      height: pdf.page.height,
    });

  pdf
    .fontSize(10)
    .font("Times-Roman")
    .fillColor("black")
    .text(
      "Venta de repuestos, autopartes, acccesorios y suministros para todo tipo de vehículos automotores.Mantenimiento y reparación de vehículos automotores NCP",
      55,
      110,
      {
        align: "center",
        baseline: "middle",
        width: 250,
        height: pdf.page.height,
      }
    );

  pdf
    .fontSize(8)
    .font("Times-Roman")
    .fillColor("black")
    .text(
      "Asc. Wari Sur Mz F Lt.9 San Juan Bautista-Huamanga-Ayacucho",
      55,
      150,
      {
        align: "center",
        baseline: "middle",
        width: 250,
        height: pdf.page.height,
      }
    );

  pdf
    .fontSize(8)
    .font("Times-Roman")
    .fillColor("black")
    .text("  Cel:  921606968", 55, 160, {
      align: "center",
      baseline: "middle",
      width: 250,
      height: pdf.page.height,
    });

  // GRACIAS POR TU PREFERENCIA
  pdf
    .fontSize(12)
    .font("Times-Roman")
    .fillColor("black")
    .text("Gracias por tu\n preferencia \n vuelve pronto ", 50, 775, {
      align: "center",
      baseline: "Times-Roman",
      width: 100,
      height: pdf.page.height,
    });
  // CONFORME
  // pdf
  //   .fontSize(12)
  //   .font("Times-Roman")
  //   .fillColor("black")
  //   .text("_____________________________\n \n  CONFORME", 190, 515, {
  //     align: "center",
  //     baseline: "Times-Roman",
  //     width: 200,
  //     height: pdf.page.height,
  //   });

  // TOTAL
  pdf
    .fontSize(12)
    .font("Times-Roman")
    .fillColor("black")
    .text("TOTAL", 145, 775, {
      align: "center",
      baseline: "middle",
      width: pdf.page.width,
      height: pdf.page.height,
    });

  //   CANTIDAD
  pdf
    .fontSize(12)
    .font("Times-Roman")
    .fillColor("black")
    .text("Cantidad", 65, 296, {
      align: "left",
      baseline: "middle",
      width: 250,
      height: pdf.page.height,
    });

  //   DESCRIPCION
  pdf
    .fontSize(12)
    .font("Times-Roman")
    .fillColor("black")
    .text("Descripción", 165, 296, {
      align: "left",
      baseline: "middle",
      width: 250,
      height: pdf.page.height,
    });

  // PRECIO UNIT
  pdf
    .fontSize(12)
    .font("Times-Roman")
    .fillColor("black")
    .text("Precio", 410, 296, {
      align: "left",
      baseline: "middle",
      width: 250,
      height: pdf.page.height,
    });

  // VALOR TOTAL
  pdf
    .fontSize(12)
    .font("Times-Roman")
    .fillColor("black")
    .text("Subtotal", 485, 296, {
      align: "left",
      baseline: "middle",
      width: 250,
      height: pdf.page.height,
    });

  getOrderHeaderAndDetails(correlative)
    .then((resp) => {
      const [header, details] = resp;
      const total = details.reduce(
        (prev, curr) => Number(curr.subTotal) + prev,
        0
      );
      // NRO BOLETA
      pdf
        .fontSize(18)
        .font("Times-Roman")
        .fillColor("black")
        .text(header.correlative, 123, 140, {
          align: "center",
          baseline: "middle",
          width: pdf.page.width,
          height: pdf.page.height,
        });

      // FECHA
      pdf
        .fontSize(12)
        .font("Times-Roman")
        .fillColor("black")
        .text(`FECHA: ${moment(header.date).format("DD/MM/yyyy")}`, 55, 200, {
          align: "left",
          baseline: "middle",
          width: 250,
          height: pdf.page.height,
        });

      // TELEF
      pdf
        .fontSize(12)
        .font("Times-Roman")
        .fillColor("black")
        .text(`TELF: ${header.phone}`, 200, 200, {
          align: "left",
          baseline: "middle",
          width: 250,
          height: pdf.page.height,
        });

      // VALIDO POR
      pdf
        .fontSize(12)
        .font("Times-Roman")
        .fillColor("black")
        .text(`VALIDO POR: ${header.validate}`, 340, 200, {
          align: "left",
          baseline: "middle",
          width: 250,
          height: pdf.page.height,
        });

      // SEÑOR (A)
      pdf
        .fontSize(12)
        .font("Times-Roman")
        .fillColor("black")
        .text(`SEÑOR (A): ${header.sir}`, 55, 225, {
          align: "left",
          baseline: "middle",
          width: 250,
          height: pdf.page.height,
        });

      // DIRECCION
      pdf
        .fontSize(12)
        .font("Times-Roman")
        .fillColor("black")
        .text(`DIRECCION: ${header.address}`, 55, 250, {
          align: "left",
          baseline: "middle",
          width: 250,
          height: pdf.page.height,
        });

      let detailRow = 320;
      details.forEach((item) => {
        pdf
          .fontSize(12)
          .font("Times-Roman")
          .fillColor("black")
          .text(item.quantity, 70, detailRow, {
            align: "left",
            baseline: "middle",
            width: 250,
            height: pdf.page.height,
          });
        pdf
          .fontSize(8)
          .font("Times-Roman")
          .fillColor("black")
          .text(item.description, 120, detailRow, {
            align: "left",
            baseline: "middle",
            width: 250,
            height: pdf.page.height,
          });
        pdf
          .fontSize(12)
          .font("Times-Roman")
          .fillColor("black")
          .text(`S/ ${item.price}`, 410, detailRow, {
            align: "left",
            baseline: "middle",
            width: 250,
            height: pdf.page.height,
          });
        pdf
          .fontSize(12)
          .font("Times-Roman")
          .fillColor("black")
          .text(`S/ ${item.subTotal}`, 485, detailRow, {
            align: "left",
            baseline: "middle",
            width: 250,
            height: pdf.page.height,
          });
        detailRow += 17;
      }); // fin foreach

      // SOLES
      pdf
        .fontSize(12)
        .font("Times-Roman")
        .fillColor("black")
        .text(`S/ ${Number(total).toFixed(2)}`, 212, 775, {
          align: "center",
          baseline: "middle",
          width: pdf.page.width,
          height: pdf.page.height,
        });

      pdf.end();
      pdf.pipe(fs.createWriteStream(filePdf));
      const url = `/pdfs/${fileName}`;

      open(url);
      console.log(" SALIDA prueba ____________" + filePdf);

      if (textSearch) return db.collection("cabecera-orden").get();
      return db
        .collection("cabecera-orden")
        .where("date", ">=", dateStart)
        .where("date", "<=", dateEnd)
        .get();
    })
    .then((doc) => {
      if (doc.empty) {
        return res.render(
          "reportes",
          getDataReportsView({
            warning: "No existen resultados de búsqueda",
            dateStart,
            dateEnd,
          })
        );
      } else {
        let dataFound = [];

        if (textSearch)
          dataFound = doc.docs
            .map((item) => ({
              ...item.data(),
              id: item.id,
              date: moment(item.data().date, "yyyy-MM-DD").format("DD/MM/yyyy"),
            }))
            .filter(
              (x) =>
                String(x.sir)
                  .toLowerCase()
                  .includes(String(textSearch).toLowerCase().trim()) ||
                String(x.correlative)
                  .toLowerCase()
                  .includes(String(textSearch).toLowerCase().trim())
            );
        else
          dataFound = doc.docs.map((item) => ({
            ...item.data(),
            id: item.id,
            date: moment(item.data().date, "yyyy-MM-DD").format("DD/MM/yyyy"),
          }));

        // Eliminar el documento generado
        fs.unlinkSync(filePdf);

        return res.render(
          "reportes",
          getDataReportsView({
            success: "Documento en PDF generado",
            dataFound,
            dateStart,
            dateEnd,
          })
        );
      }
    })
    .catch((error) => {
      console.error(error);
      return res.render(
        "reportes",
        getDataReportsView({
          error: "Error al Generar Documento en PDF",
          dateStart,
          dateEnd,
        })
      );
    });
});

router.post("/generate-excel", (req, res) => {
  const { dateStart, dateEnd, textSearch } = req.query;
  const fileName = `reporte-${moment(new Date()).format("DDMMyyyy")}.xlsx`;
  const fileExcel = path.join(__dirname, "../public/xls/" + fileName);

  const promiseCollection = textSearch
    ? db.collection("cabecera-orden").get()
    : db
        .collection("cabecera-orden")
        .where("date", ">=", dateStart)
        .where("date", "<=", dateEnd)
        .get();

  promiseCollection
    .then((doc) => {
      if (doc.empty) {
        return res.render(
          "reportes",
          getDataReportsView({
            warning: "No existen resultados de búsqueda",
            dateStart,
            dateEnd,
          })
        );
      } else {
        let dataFound = [];
        if (textSearch)
          dataFound = doc.docs
            .map((item) => ({
              ...item.data(),
              id: item.id,
              date: moment(item.data().date, "yyyy-MM-DD").format("DD/MM/yyyy"),
            }))
            .filter(
              (x) =>
                String(x.sir)
                  .toLowerCase()
                  .includes(String(textSearch).toLowerCase().trim()) ||
                String(x.correlative)
                  .toLowerCase()
                  .includes(String(textSearch).toLowerCase().trim())
            );
        else
          dataFound = doc.docs.map((item) => ({
            ...item.data(),
            id: item.id,
            date: moment(item.data().date, "yyyy-MM-DD").format("DD/MM/yyyy"),
          }));

        // Inicio Generar excel

        // Crear una nueva hoja de cálculo
        const workbook = new ExcelJS.Workbook();

        // Agregar una nueva hoja de trabajo
        const worksheet = workbook.addWorksheet(
          `Reporte ${moment(new Date()).format("DDMMyyyy")}`
        );

        const nameColB = worksheet.getColumn("B");
        const nameColC = worksheet.getColumn("C");
        const nameColD = worksheet.getColumn("D");
        const nameColE = worksheet.getColumn("E");
        const nameColF = worksheet.getColumn("F");
        const nameColG = worksheet.getColumn("G");
        const nameColH = worksheet.getColumn("H");
        nameColB.width = 15;
        nameColC.width = 45;
        nameColD.width = 15;
        nameColE.width = 20;
        nameColF.width = 30;
        nameColG.width = 40;
        nameColH.width = 20;

        const row = worksheet.getRow(2);

        row.worksheet.columns = row.worksheet.columns.map((item) => {
          item.style.alignment = { horizontal: "center" };
          return item;
        });

        // add a table to a sheet
        worksheet.addTable({
          name: "table1",
          ref: "B2",
          headerRow: true,
          totalsRow: false,
          style: {
            theme: "TableStyleDark2",
            showRowStripes: true,
          },
          columns: [
            {
              name: "Documento",
              filterButton: true,
              totalsRowLabel: "Total:",
              alignment: { horizontal: "center" },
            },
            {
              name: "Cliente",
              filterButton: true,
              alignment: { horizontal: "center" },
            },
            { name: "Fecha" },
            { name: "Teléfono" },
            { name: "Direccion" },
            { name: "Validado" },
            { name: "Total", totalsRowFunction: "sum" },
          ],
          rows: dataFound.map((item) => {
            return [
              item.correlative,
              item.sir,
              moment(item.date, "yyyy-MM-DD").format("DD/MM/yyyy"),
              item.phone,
              item.address,
              item.validate,
              Number(item.total),
            ];
          }),
        });

        // Guardar el archivo en disco
        workbook.xlsx
          .writeFile(fileExcel)
          .then(() => {
            const url = `/xls/${fileName}`;
            return res.redirect(url);
            // open(url);

            // Eliminar el documento generado
            setTimeout(() => {
              fs.unlinkSync(fileExcel);
            }, 1000);

            return res.render(
              "reportes",
              getDataReportsView({
                success: "Reporte en Excel Generado",
                dataFound,
                dateStart,
                dateEnd,
              })
            );
          })
          .catch((error) => {
            console.error(error);
            return res.render(
              "reportes",
              getDataReportsView({
                error: "Error al Generar Reporte en Excel",
                dateStart,
                dateEnd,
              })
            );
          });
        // Fin Generar excel
      }
    })
    .catch((error) => {
      console.error(error);
      return res.render(
        "reportes",
        getDataReportsView({
          error: "Error al filtrar ordenes",
          dateStart,
          dateEnd,
        })
      );
    });
});

/*    END PDF   */

module.exports = router;
