exports.params = 
  {
    "LNA_GAIN":
    {
      "code": 0,
      "vals":
      {
	"-5.0_DB": 0,
	"-2.5_DB": 1,
	"0.0_DB": 4,
	"2.5_DB": 5,
	"5.0_DB": 6,
	"10.0_DB": 8,
	"12.5_DB": 9,
	"15.0_DB": 10,
	"17.5_DB": 11,
	"20.0_DB": 12,
	"25.0_DB": 13,
	"30.0_DB": 14
       }
     },
    "LNA_ENHANCE":
    {
      "code": 1,
      "vals":
      {
	"OFF":0,
	"0": 1,
	"1": 3,
	"2": 5,
	"3": 7
       }
     },
    "BAND":
    {
      "code": 2,
      "vals":
      {
	"VHF2": 0,
	"VHF3": 1,
	"UHF": 2,
	"LBAND": 3
       }
     },

    "RF_FILTER":
    {
      "code": 3,
      "vals":
      {
	"268_MHZ": 0,
	"299_MHZ": 8,
	"509_MHZ": 0,
	"656_MHZ": 8,
	"360_MHZ": 0,
	"380_MHZ": 1,
	"405_MHZ": 2,
	"425_MHZ": 3,
	"450_MHZ": 4,
	"475_MHZ": 5,
	"505_MHZ": 6,
	"540_MHZ": 7,
	"575_MHZ": 8,
	"615_MHZ": 9,
	"670_MHZ": 10,
	"720_MHZ": 11,
	"760_MHZ": 12,
	"840_MHZ": 13,
	"890_MHZ": 14,
	"970_MHZ": 15,
	"1300_MHZ": 0,
	"1320_MHZ": 1,
	"1360_MHZ": 2,
	"1410_MHZ": 3,
	"1445_MHZ": 4,
	"1460_MHZ": 5,
	"1490_MHZ": 6,
	"1530_MHZ": 7,
	"1560_MHZ": 8,
	"1590_MHZ": 9,
	"1640_MHZ": 10,
	"1660_MHZ": 11,
	"1680_MHZ": 12,
	"1700_MHZ": 13,
	"1720_MHZ": 14,
	"1750_MHZ": 15
       }
     },
    "MIXER_GAIN": 
    {
      "code": 4,
      "vals":
      {
	"4.0_DB": 0,
	"12.0_DB": 1
       }
     },
    "BIAS_CURRENT":
    {
      "code": 5,
      "vals":
      {
	"LBAND": 0,
	"1": 1,
	"2": 2,
	"VUBAND": 3
       }
     },

    "MIXER_FILTER":
    {
      "code": 6,
      "vals":
      {
	"27.0_MHZ": 0,
	"4.6_MHZ": 8,
	"4.2_MHZ": 9,
	"3.8_MHZ": 10,
	"3.4_MHZ": 11,
	"3.0_MHZ": 12,
	"2.7_MHZ": 13,
	"2.3_MHZ": 14,
	"1.9_MHZ": 15
       }
     },

    "IF_GAIN_1": 
    {
      "code": 7,
      "vals":
      {
	"-3.0_DB": 0,
	"6.0_DB": 1
       }
     },

    "IF_GAIN_MODE":
    {
      "code": 8,
      "vals":
      {
	"LINEARITY": 0,
	"SENSITIVITY": 1
       }
     },

    "IF_RC_FILTER":
    {
      "code": 9,
      "vals":
      {
	"21.4_MHZ": 0,
	"21.0_MHZ": 1,
	"17.6_MHZ": 2,
	"14.7_MHZ": 3,
	"12.4_MHZ": 4,
	"10.6_MHZ": 5,
	"9.0_MHZ": 6,
	"7.7_MHZ": 7,
	"6.4_MHZ": 8,
	"5.3_MHZ": 9,
	"4.4_MHZ": 10,
	"3.4_MHZ": 11,
	"2.6_MHZ": 12,
	"1.8_MHZ": 13,
	"1.2_MHZ": 14,
	"1.0_MHZ": 15
       }
     },

    "IF_GAIN_2": 
    {
      "code": 10,
      "vals":
      {
	"0.0_DB": 0,
	"3.0_DB": 1,
	"6.0_DB": 2,
	"9.0_DB": 3
       }
     },

    "IF_GAIN_3": 
    {
      "code": 11,
      "vals":
      {
	"0.0_DB": 0,
	"3.0_DB": 1,
	"6.0_DB": 2,
	"9.0_DB": 3
       }
     },

    "IF_FILTER":
    {
      "code": 12,
      "vals":
      {
	"5.50_MHZ": 0,
	"5.30_MHZ": 1,
	"5.00_MHZ": 2,
	"4.80_MHZ": 3,
	"4.60_MHZ": 4,
	"4.40_MHZ": 5,
	"4.30_MHZ": 6,
	"4.10_MHZ": 7,
	"3.90_MHZ": 8,
	"3.80_MHZ": 9,
	"3.70_MHZ": 10,
	"3.60_MHZ": 11,
	"3.40_MHZ": 12,
	"3.30_MHZ": 13,
	"3.20_MHZ": 14,
	"3.10_MHZ": 15,
	"3.00_MHZ": 16,
	"2.95_MHZ": 17,
	"2.90_MHZ": 18,
	"2.80_MHZ": 19,
	"2.75_MHZ": 20,
	"2.70_MHZ": 21,
	"2.60_MHZ": 22,
	"2.55_MHZ": 23,
	"2.50_MHZ": 24,
	"2.45_MHZ": 25,
	"2.40_MHZ": 26,
	"2.30_MHZ": 27,
	"2.28_MHZ": 28,
	"2.24_MHZ": 29,
	"2.20_MHZ": 30,
	"2.15_MHZ": 31
       }
     },

    "IF_GAIN_4": 
    {
      "code": 13,
      "vals":
      {
	"0.0_DB": 0,
	"1.0_DB": 1,
	"2.0_DB": 2
       }
     },

    "IF_GAIN_5": 
    {
      "code": 14,
      "vals":
      {
	"3.0_DB": 0,
	"6.0_DB": 1,
	"9.0_DB": 2,
	"12.0_DB": 3,
	"15.0_DB": 4
       }
     },

    "IF_GAIN_6": 
    {
      "code": 15,
      "vals":
      {
	"3.0_DB": 0,
	"6.0_DB": 1,
	"9.0_DB": 2,
	"12.0_DB": 3,
	"15.0_DB": 4
       }
     }
   };
