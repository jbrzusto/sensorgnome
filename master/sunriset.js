/* 
   Calculations of sunrise, sunset, and noon times.
   Extracted from source code of this page:

     http://www.esrl.noaa.gov/gmd/grad/solcalc/

   which is US-government and so presumably not copyrighted.
   
   This file released as public domain.

   All dates passed to and returned by exported methods are
   numbers representing seconds since the epoch (i.e. the result of
   doing X.getTime()/1000 method on a javascript Date oject X).

*/

function calcTimeJulianCent(jd)
{
    var T = (jd - 2451545.0)/36525.0
    return T
}

function radToDeg(angleRad) 
{
    return (180.0 * angleRad / Math.PI);
}

function degToRad(angleDeg) 
{
    return (Math.PI * angleDeg / 180.0);
}

function calcGeomMeanLongSun(t)
{
    var L0 = 280.46646 + t * (36000.76983 + t*(0.0003032))
    while(L0 > 360.0)
    {
        L0 -= 360.0
    }
    while(L0 < 0.0)
    {
        L0 += 360.0
    }
    return L0		// in degrees
}

function calcGeomMeanAnomalySun(t)
{
    var M = 357.52911 + t * (35999.05029 - 0.0001537 * t);
    return M;		// in degrees
}

function calcEccentricityEarthOrbit(t)
{
    var e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
    return e;		// unitless
}

function calcSunEqOfCenter(t)
{
    var m = calcGeomMeanAnomalySun(t);
    var mrad = degToRad(m);
    var sinm = Math.sin(mrad);
    var sin2m = Math.sin(mrad+mrad);
    var sin3m = Math.sin(mrad+mrad+mrad);
    var C = sinm * (1.914602 - t * (0.004817 + 0.000014 * t)) + sin2m * (0.019993 - 0.000101 * t) + sin3m * 0.000289;
    return C;		// in degrees
}

function calcSunTrueLong(t)
{
    var l0 = calcGeomMeanLongSun(t);
    var c = calcSunEqOfCenter(t);
    var O = l0 + c;
    return O;		// in degrees
}

function calcSunTrueAnomaly(t)
{
    var m = calcGeomMeanAnomalySun(t);
    var c = calcSunEqOfCenter(t);
    var v = m + c;
    return v;		// in degrees
}

function calcSunRadVector(t)
{
    var v = calcSunTrueAnomaly(t);
    var e = calcEccentricityEarthOrbit(t);
    var R = (1.000001018 * (1 - e * e)) / (1 + e * Math.cos(degToRad(v)));
    return R;		// in AUs
}

function calcSunApparentLong(t)
{
    var o = calcSunTrueLong(t);
    var omega = 125.04 - 1934.136 * t;
    var lambda = o - 0.00569 - 0.00478 * Math.sin(degToRad(omega));
    return lambda;		// in degrees
}

function calcMeanObliquityOfEcliptic(t)
{
    var seconds = 21.448 - t*(46.8150 + t*(0.00059 - t*(0.001813)));
    var e0 = 23.0 + (26.0 + (seconds/60.0))/60.0;
    return e0;		// in degrees
}

function calcObliquityCorrection(t)
{
    var e0 = calcMeanObliquityOfEcliptic(t);
    var omega = 125.04 - 1934.136 * t;
    var e = e0 + 0.00256 * Math.cos(degToRad(omega));
    return e;		// in degrees
}

function calcSunDeclination(t)
{
    var e = calcObliquityCorrection(t);
    var lambda = calcSunApparentLong(t);

    var sint = Math.sin(degToRad(e)) * Math.sin(degToRad(lambda));
    var theta = radToDeg(Math.asin(sint));
    return theta;		// in degrees
}

function calcEquationOfTime(t)
{
    var epsilon = calcObliquityCorrection(t);
    var l0 = calcGeomMeanLongSun(t);
    var e = calcEccentricityEarthOrbit(t);
    var m = calcGeomMeanAnomalySun(t);

    var y = Math.tan(degToRad(epsilon)/2.0);
    y *= y;

    var sin2l0 = Math.sin(2.0 * degToRad(l0));
    var sinm   = Math.sin(degToRad(m));
    var cos2l0 = Math.cos(2.0 * degToRad(l0));
    var sin4l0 = Math.sin(4.0 * degToRad(l0));
    var sin2m  = Math.sin(2.0 * degToRad(m));

    var Etime = y * sin2l0 - 2.0 * e * sinm + 4.0 * e * y * sinm * cos2l0 - 0.5 * y * y * sin4l0 - 1.25 * e * e * sin2m;
    return radToDeg(Etime)*4.0;	// in minutes of time
}

function calcHourAngleSunrise(lat, solarDec)
{
    var latRad = degToRad(lat);
    var sdRad  = degToRad(solarDec);
    var HAarg = (Math.cos(degToRad(90.833))/(Math.cos(latRad)*Math.cos(sdRad))-Math.tan(latRad) * Math.tan(sdRad));
    var HA = Math.acos(HAarg);
    return HA;		// in radians (for sunset, use -HA)
}

function getJD(year, month, day)
{
    // year: 4 digit year
    // month: 1, 2, ..., 12
    // day: 1, 2, ..., (last day of month)

    if (month <= 2) {
        year -= 1
        month += 12
    }
    var A = Math.floor(year/100)
    var B = 2 - A + Math.floor(A/4)
    var JD = Math.floor(365.25*(year + 4716)) + Math.floor(30.6001*(month+1)) + day + B - 1524.5
    return JD
}

function calcSolNoon(jd, longitude)
{
    var tnoon = calcTimeJulianCent(jd - longitude/360.0)
    var eqTime = calcEquationOfTime(tnoon)
    var solNoonOffset = 720.0 - (longitude * 4) - eqTime // in minutes
    var newt = calcTimeJulianCent(jd + solNoonOffset/1440.0)
    eqTime = calcEquationOfTime(newt)
    solNoonGMT = 720 - (longitude * 4) - eqTime // in minutes
    while (solNoonGMT < 0.0) {
        solNoonGMT += 1440.0;
    }
    while (solNoonGMT >= 1440.0) {
        solNoonGMT -= 1440.0;
    }
    return solNoonGMT; // in minutes
}


function calcSunriseSetUTC(rise, JD, latitude, longitude)
{
    var t = calcTimeJulianCent(JD);
    var eqTime = calcEquationOfTime(t);
    var solarDec = calcSunDeclination(t);
    var hourAngle = calcHourAngleSunrise(latitude, solarDec);
    if (!rise) hourAngle = -hourAngle;
    var delta = longitude + radToDeg(hourAngle);
    var timeUTC = 720 - (4.0 * delta) - eqTime;	// in minutes
    
    return timeUTC;
}

function getDayFromDate(date) {
    // return normal and julian day for given date, or for today if date is missing
    date = date === undefined ? new Date() : new Date(date * 1000)
    var year = date.getUTCFullYear(),
    month = date.getUTCMonth(),
    day = date.getUTCDate();
    return {jday: getJD(year, month+1, day), start: Date.UTC(year, month, day) / 1000};
}

function sunrise(lat, lng, date) {
    // return sunrise for day of date (both in UTC)

    var day = getDayFromDate(date);
    var rise = calcSunriseSetUTC(1, day.jday, lat, lng);
    return day.start + rise * 60;
}

function sunset(lat, lng, date) {
    // assumes year, month, day are given in GMT
    // returns sunset in GMT

    var day = getDayFromDate(date);
    var set = calcSunriseSetUTC(0, day.jday, lat, lng);
    return day.start + set * 60;
}

function noon(lng, date) {
    // assumes year, month, day are given in GMT
    // returns solar noon in GMT

    var day = getDayFromDate(date);
    var noon = calcSolNoon(day.jday, lng);
    return day.start + noon * 60;
}

exports.sunrise=sunrise;
exports.sunset=sunset;
exports.noon=noon;
