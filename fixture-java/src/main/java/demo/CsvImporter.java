package demo;

import java.math.BigDecimal;

public final class CsvImporter {
    private CsvImporter() {}

    public static Catalog parse(String csv) {
        Catalog catalog = new Catalog();
        String[] lines = csv.split("\\R");
        for (int i = 0; i < lines.length; i++) {
            if (lines[i].isBlank()) continue;
            String[] fields = lines[i].split(",", -1);
            if (fields.length != 5) throw new IllegalArgumentException("line " + (i + 1) + ": expected 5 fields");
            catalog.add(new Book(fields[0], fields[1], fields[2], new BigDecimal(fields[3]), Integer.parseInt(fields[4])));
        }
        return catalog;
    }
}
