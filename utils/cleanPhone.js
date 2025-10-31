module.exports = {
    cleanPhone(phone) {
      let preffix = "+254";
      let result = "";
  
      //Ensure there are no spaces in the provided contact.
  
      contact = phone.toString().replace(/\s/g, "");
  
      //Remove 0 if the contact starts with one.
  
      if (contact.charAt(0) == 0) {
        result = preffix + contact.substr(1);
      } else if (contact.charAt(0) == "7") {
        result = preffix + contact;
      } else if (contact.charAt(0) == "2") {
        result = "+" + contact;
      } else if (contact.charAt(0) == "+") {
        result = contact;
      } else if (contact.charAt(0) == "1") {
        result = preffix + contact;
      }
  
      return result;
    },
  
    groupBy(objectArray, property) {
      return objectArray.reduce(function (acc, obj) {
        var key = obj[property];
        if (!acc[key]) {
          acc[key] = [];
        }
        acc[key].push(obj);
        return acc;
      }, {});
    },
  };
  