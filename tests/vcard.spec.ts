import { App, TFile } from "obsidian";
import { vcard } from "src/contacts/vcard";
import { setApp } from "src/context/sharedAppContext";
import { fixtures } from "tests/fixtures/fixtures";
import { describe, expect, it, vi } from 'vitest';

setApp({
  metadataCache: {
    getFileCache: (file: TFile) => {
      const frontmatter = fixtures.readFrontmatterFixture(file.basename);
      return {
        frontmatter
      };
    }
  }
} as unknown as App);

vi.mock('src/ui/modals/contactNameModal', () => {
  class ContactNameModal {
    private callback: (givenName: string, familyName: string) => void;

    constructor(
      app: any,
      vcfFn: string | undefined,
      callback: (givenName: string, familyName: string) => void
    ) {
      this.callback = callback;
    }
    open() {
      this.callback('Foo', 'Bar');
    }
    onOpen() {}
    onClose() {}
    close() {}
  }

  return { ContactNameModal };
});

describe('vcard creatEmpty', () => {
  it('should ask for a firstname and lastname ', async () => {
    const empty = await vcard.createEmpty();
    const expectedFields = ['N.PREFIX', 'N.GN', 'N.MN', 'N.FN', 'N.SUFFIX'];
    expectedFields.forEach((field) => {
      expect(empty).toHaveProperty(field);
    });
    expect(empty['N.GN']).toBe('Foo');
    expect(empty['N.FN']).toBe('Bar');
  });
});

describe('vcard parse', () => {

  it('Should first name and lastname are filled', async () => {
    const vcf = fixtures.readVcfFixture('noFirstName.vcf');
    const result = await vcard.parse(vcf);
    const expectedFields = ['N.PREFIX', 'N.GN', 'N.MN', 'N.FN', 'N.SUFFIX'];
    expectedFields.forEach((field) => {
      expect(result[0]).toHaveProperty(field);
    });
    expect(result[0]['N.GN']).toBe('Foo');
    expect(result[0]['N.FN']).toBe('Bar');

  });

  it('should only import variables that are in a predifined list ', async () => {
    const vcf = fixtures.readVcfFixture('hasNonSpecParameters.vcf');
    const result = await vcard.parse(vcf);
    expect(result[0]['N.GN']).toBe('Name');
    expect(result[0]['N.FN']).toBe('My');
    expect(result[0]['NONSPEC']).toBe(undefined);
    expect(result[0]['X-NONSPEC']).toBe(undefined);
  });

  it('should convert some (photo, version) v3 parameters to a v4 implementation', async () => {
    const vcf = fixtures.readVcfFixture('v3SpecificParameters.vcf');
    const result = await vcard.parse(vcf);
    expect(result[0]['N.GN']).toBe('Huntelaar');
    expect(result[0]['N.FN']).toBe('Jan');
    expect(result[0]['PHOTO']).toEqual('data:image/type=jpeg;base64,/9j/4AAQSkZJRgABAQEAAAAAAAD/2wCEAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQ');
    expect(result[0]['VERSION']).toBe('4.0');
  });

  it('should be able to parse multiple cards from one file', async () => {
    const vcf = fixtures.readVcfFixture('hasMultipleCards.vcf');
    const result = await vcard.parse(vcf);
    expect(result.length).toBe(3);
    expect(result[0]['N.GN']).toBe('Foo');
    expect(result[0]['N.FN']).toBe('Bar');
  });

  it('should add indexes to duplicate field names tobe spec compatible', async () => {
    const vcf = fixtures.readVcfFixture('hasDuplicateParameters.vcf');
    const result = await vcard.parse(vcf);
    const expectedKeys = [
      "TEL[WORK]",
      "TEL[1:WORK]",
      "TEL[2:WORK]",
      "TEL[HOME]",
      "EMAIL",
      "EMAIL[1:]",
      "EMAIL[2:]",
      "EMAIL[3:]",
      "ADR.STREET",
      "ADR.LOCALITY",
      "ADR.REGION",
      "ADR.POSTAL",
      "ADR.COUNTRY",
      "ADR[1:].STREET",
      "ADR[1:].LOCALITY",
      "ADR[1:].REGION",
      "ADR[1:].POSTAL",
      "ADR[1:].COUNTRY",
      "ADR[2:].STREET",
      "ADR[2:].LOCALITY",
      "ADR[2:].REGION",
      "ADR[2:].POSTAL",
      "ADR[2:].COUNTRY"
    ];

    for (const key of expectedKeys) {
      expect(result[0][key]).not.toBeUndefined();
      expect(result[0][key]).not.toBe('');
    }
  });

  it('should preform try to unify dates received ', async () => {
    const vcf = fixtures.readVcfFixture('hasDifferentDates.vcf');
    const result = await vcard.parse(vcf);

    const isIsoDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
    expect(isIsoDate(result[0]['BDAY'])).toBe(true);
    expect(isIsoDate(result[0]['BDAY[Child,junior]'])).toBe(true);
    expect(isIsoDate(result[0]['ANNIVERSARY'])).toBe(true);
    expect(isIsoDate(result[0]['ANNIVERSARY[1:]'])).toBe(true);
    expect(result[0]['ANNIVERSARY[2:]']).toBe('some not convertable string');
  });

  it('should be able to handle a spec folded multiline.', async () => {
    const vcf = fixtures.readVcfFixture('hasFoldeLines.vcf');
    const result = await vcard.parse(vcf);
    expect(result[0]['N.GN']).toBe('Huntelaar');
    expect(result[0]['N.FN']).toBe('Jan');
    expect(result[0]['NOTE']).toBe('This is a long note that continues on the next line, and still keeps going.');
  });
});


describe('vcard tostring', () => {
  it('should be able to turn base frontmatter to vcf string', async () => {
    const result = await vcard.toString([{ basename: 'base.frontmatter' } as TFile]);
    const { vcards, errors } = result;

    expect(errors).toEqual([]);

    expect(vcards).toMatch(/^N:OReilly;Liam;;;$/m);
    expect(vcards).toMatch(/^ADR;TYPE=HOME:;;18 Clover Court;Dublin;;D02;Ireland$/m);

    const emailLines = vcards.match(/^EMAIL;TYPE=.*:.*$/gm) || [];
    expect(emailLines.length).toBe(2);
    expect(emailLines[0]).toMatch(/TYPE=HOME/);
    expect(emailLines[1]).toMatch(/TYPE=WORK/);

    // FN should include the file name (FN:base.frontmatter)
    expect(vcards).toMatch(/^FN:base\.frontmatter$/m);

    expect(vcards).toMatch(/^BEGIN:VCARD$/m);
    expect(vcards).toMatch(/^END:VCARD$/m);
  });

  it('should be able revert the indexed fields to lines', async () => {
    const result = await vcard.toString([{ basename: 'hasDuplicateParameters.frontmatter' } as TFile]);
    const { vcards, errors } = result;

    const aniLines = vcards.match(/^ANNIVERSARY:.*$/gm) || [];
    expect(aniLines.length).toBe(2);
    const telLines = vcards.match(/^TEL.*:.*$/gm) || [];
    expect(telLines.length).toBe(5);
    const telWorkLines = vcards.match(/^TEL;TYPE=WORK:.*$/gm) || [];
    expect(telWorkLines.length).toBe(2);
    expect(vcards).toMatch(/^BEGIN:VCARD$/m);
    expect(vcards).toMatch(/^END:VCARD$/m);
  });

  it('should collect and return a error if there is any type of failure', async () => {
    const result = await vcard.toString([{ basename: 'no-exist.frontmatter' } as TFile]);
    const { vcards, errors } = result;
    expect(errors.length).toBe(1)
    expect(errors[0].file).toBe('no-exist.frontmatter');
    expect(errors[0].message).not.toBe('');
  });


});
