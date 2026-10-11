package demo.jpacontext;

/** oracle: jpacontext-dto — NEGATIVE. Method returns a DTO (non-entity). */
public class JpacontextDtoCase {

    public DtoData fetch() {
        return new DtoData();
    }
}

class DtoData {

    private String name;
}
