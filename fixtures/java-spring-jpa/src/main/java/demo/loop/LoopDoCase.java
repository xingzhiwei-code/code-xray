package demo.loop;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Service;

/** oracle: loop-do — POSITIVE. Repository write inside a do/while loop. */
@Service
public class LoopDoCase {

    private final LoopDoOrderRepository orderRepository;

    public LoopDoCase(LoopDoOrderRepository orderRepository) {
        this.orderRepository = orderRepository;
    }

    public void flush(List<LoopDoOrder> orders) {
        int index = 0;
        do {
            orderRepository.save(orders.get(index));
            index = index + 1;
        } while (index < orders.size());
    }
}

interface LoopDoOrderRepository extends JpaRepository<LoopDoOrder, Long> {
}

class LoopDoOrder {
}
