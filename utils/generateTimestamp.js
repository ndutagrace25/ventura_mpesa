const generateTimestamp = () => {
  /**
   *
   * @param {*} e
   * @returns timestamp of the format YYYYMMDDHHMMSS
   */
  const cleanDate = (e) => {
    return e < 10 ? "0" + e : e;
  };
  let currentDate = new Date();
  let currentTime = new Date(
    currentDate.toLocaleString("en-us", { timeZone: "Africa/Nairobi" })
  );
  let month = cleanDate(currentTime.getMonth() + 1);
  let date = cleanDate(currentTime.getDate());
  let hour = cleanDate(currentTime.getHours());
  let minutes = cleanDate(currentTime.getMinutes());
  let seconds = cleanDate(currentTime.getSeconds());

  return (
    currentTime.getFullYear() +
    "" +
    month +
    "" +
    date +
    "" +
    hour +
    "" +
    minutes +
    "" +
    seconds
  );
};

module.exports = generateTimestamp;
