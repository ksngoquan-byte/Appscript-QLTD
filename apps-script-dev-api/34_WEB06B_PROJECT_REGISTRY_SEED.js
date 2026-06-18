const WEB06B_PROJECT_ROWS = [
  {
    ProjectCode: '37-5.HL1',
    ProjectName: 'C1 Hưng Lộc',
    MasterSpreadsheetId: '1EZk5YM-P132IkM9TWoKVHAqcajbiKs2O2hgjTWPe8K0',
    DeptSpreadsheetId: '1JH90mNlV0jy7K_e065WEf5FNObuoQjMvAFKF6Wqcx1U',
    DefaultTaskSheet: 'Cong_viec',
    DefaultDeptSheet: 'BQLDA',
    Status: 'ACTIVE',
    SortOrder: 20,
    Note: 'C1 Hưng Lộc - mapping WEB-06B'
  },
  {
    ProjectCode: '24-1.ĐB',
    ProjectName: 'Cốc Lếu',
    MasterSpreadsheetId: '1vvO54Lqimem-wpAD-O1UNtqcItBk-hDAnzbBVKtO2Js',
    DeptSpreadsheetId: '1yI3G79E1GaPi0lPdCgFBzTSAp6Cx0thWRibscgIEgU4',
    DefaultTaskSheet: 'Cong_viec',
    DefaultDeptSheet: 'BQLDA',
    Status: 'ACTIVE',
    SortOrder: 30,
    Note: 'Cốc Lếu - mapping WEB-06B'
  }
];

function web06bSeedProjectRegistry() {
  const projectsSheet = qltdProjectsEnsureSheet_();
  const deptsSheet = qltdProjectDeptsEnsureSheet_();
  const deptRows = [];

  web06bBuildDeptRows_(deptRows, '37-5.HL1', 'HL1', 'C1 Hưng Lộc');
  web06bBuildDeptRows_(deptRows, '24-1.ĐB', 'DB', 'Cốc Lếu');

  const projectsResult = web06bUpsertRowsByKey_(projectsSheet, ['ProjectCode'], WEB06B_PROJECT_ROWS);
  const deptsResult = web06bUpsertRowsByKey_(deptsSheet, ['ProjectCode', 'DeptCode'], deptRows);

  return {
    success: true,
    projectsUpserted: projectsResult.upserted,
    projectsUpdated: projectsResult.updated,
    projectDeptsUpserted: deptsResult.upserted,
    projectDeptsUpdated: deptsResult.updated
  };
}

function web06bBuildDeptRows_(target, projectCode, unitSuffix, projectName) {
  const depts = [
    ['BQLDA', 'BQLDA', 'BQLDA'],
    ['PTDA', 'PTDA', 'PTDA'],
    ['GPMB', 'GPMB', 'GPMB'],
    ['Thietke', 'Thietke', 'Thiết kế'],
    ['Tieuchuan', 'Tieuchuan', 'Tiêu chuẩn'],
    ['Dauthau', 'Dauthau', 'Đấu thầu'],
    ['Kehoach', 'Kehoach', 'Kế hoạch'],
    ['KeToan', 'KeToan', 'Kế toán']
  ];

  depts.forEach(function(dept, index) {
    target.push({
      ProjectCode: projectCode,
      DeptCode: dept[0],
      ProjectUnitCode: dept[1] + '_' + unitSuffix,
      DeptName: dept[2] + ' ' + projectName,
      Status: 'ACTIVE',
      SortOrder: (index + 1) * 10,
      Note: 'WEB-06B'
    });
  });
}

function web06bUpsertRowsByKey_(sheet, keyHeaders, rows) {
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(value) {
    return String(value || '').trim();
  });
  const headerIndex = {};
  let updated = 0;
  let upserted = 0;

  headers.forEach(function(header, index) {
    headerIndex[header] = index;
  });

  keyHeaders.forEach(function(keyHeader) {
    if (!Object.prototype.hasOwnProperty.call(headerIndex, keyHeader)) {
      throw new Error('Sheet ' + sheet.getName() + ' missing key header: ' + keyHeader);
    }
  });

  const dataRowCount = Math.max(sheet.getLastRow() - 1, 0);
  const values = dataRowCount > 0
    ? sheet.getRange(2, 1, dataRowCount, lastCol).getValues()
    : [];
  const existing = {};

  values.forEach(function(row, offset) {
    const key = web06bBuildKeyFromRow_(row, headerIndex, keyHeaders);
    if (key) existing[key] = offset + 2;
  });

  rows.forEach(function(rowObj) {
    const key = keyHeaders.map(function(keyHeader) {
      return String(rowObj[keyHeader] || '').trim();
    }).join('::');

    const output = headers.map(function(header) {
      return Object.prototype.hasOwnProperty.call(rowObj, header) ? rowObj[header] : '';
    });

    if (existing[key]) {
      sheet.getRange(existing[key], 1, 1, lastCol).setValues([output]);
      updated += 1;
    } else {
      sheet.appendRow(output);
      upserted += 1;
    }
  });

  return {
    updated: updated,
    upserted: upserted
  };
}

function web06bBuildKeyFromRow_(row, headerIndex, keyHeaders) {
  return keyHeaders.map(function(keyHeader) {
    return String(row[headerIndex[keyHeader]] || '').trim();
  }).join('::');
}
