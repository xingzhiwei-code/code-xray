package demo.inject;

import org.springframework.data.jpa.repository.JpaRepository;

public interface InjectedRepository extends JpaRepository<InjectedOrder, Long> {}
